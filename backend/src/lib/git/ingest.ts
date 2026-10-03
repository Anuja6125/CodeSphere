import fs from "fs";
import path from "path";
import os from "os";
import { detectTechStack, TechStackInfo } from "./stack-detector";

export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  cleanUrl: string;
}

export function parseGithubUrl(url: string): ParsedGithubUrl | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
    return {
      owner,
      repo,
      cleanUrl: `https://github.com/${owner}/${repo}.git`,
    };
  } catch {
    return null;
  }
}

export interface IngestedFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  content?: string;
  linesCount: number;
}

export interface IngestResult {
  owner: string;
  repoName: string;
  defaultBranch: string;
  files: IngestedFile[];
  totalFiles: number;
  totalLines: number;
  techStack: TechStackInfo;
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".venv",
  "__pycache__",
  ".idea",
  ".vscode",
]);

const IGNORED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "pdf",
  "zip", "tar", "gz", "7z", "rar", "exe", "dll", "so", "dylib",
  "mp3", "mp4", "wav", "avi", "mov", "ttf", "woff", "woff2", "eot",
  "lock"
]);

const SENSITIVE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
];

const MAX_FILES = 10_000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function isSensitiveFile(fileName: string): boolean {
  if (fileName.toLowerCase() === ".env.example") return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fileName));
}

export interface ScanResult {
  files: IngestedFile[];
  totalFiles: number;
  totalLines: number;
  techStack: TechStackInfo;
}

/** Walk a local project folder and read every text file we care about. */
export async function scanRepositoryDirectory(rootDir: string): Promise<ScanResult> {
  const files: IngestedFile[] = [];
  let totalLines = 0;

  async function walk(dir: string, relativePrefix = ""): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (IGNORED_DIRS.has(entry.name) || entry.name === "__MACOSX") return;

      const fullPath = path.join(dir, entry.name);
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        files.push({ path: relPath, name: entry.name, extension: "", size: 0, isDirectory: true, linesCount: 0 });
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = entry.name.includes(".") ? entry.name.split(".").pop()!.toLowerCase() : "";
        if (IGNORED_EXTENSIONS.has(ext)) return;
        if (isSensitiveFile(entry.name)) return;

        let content: string | undefined = undefined;
        let linesCount = 0;
        let size = 0;
        try {
          const stat = await fs.promises.stat(fullPath);
          size = stat.size;
          if (size < 1024 * 1024) { // Only read files smaller than 1MB
            content = await fs.promises.readFile(fullPath, "utf-8");
            linesCount = content.split("\n").length;
            totalLines += linesCount;
          }
        } catch {
          // Ignore unreadable binary or permission issues
        }
        files.push({ path: relPath, name: entry.name, extension: ext, size, isDirectory: false, content, linesCount });
      }
    }));
  }

  await walk(rootDir);

  const regularFiles = files.filter((file) => !file.isDirectory);
  const totalBytes = regularFiles.reduce((sum, file) => sum + file.size, 0);
  if (regularFiles.length > MAX_FILES) {
    throw new Error(`Repository exceeds the supported limit of ${MAX_FILES.toLocaleString()} files.`);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error("Repository exceeds the supported size limit of 100 MB.");
  }

  return {
    files,
    totalFiles: regularFiles.length,
    totalLines,
    techStack: detectTechStack(files.map((f) => f.path)),
  };
}

/**
 * Download a GitHub repo (archive ZIP, no git needed), scan it, then delete the temp copy.
 * Kept for the existing tests and scripts. The app itself uses services/ingestion.ts.
 */
export async function ingestRepository(repoUrl: string): Promise<IngestResult> {
  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub repository URL.");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codesphere-repo-"));
  try {
    const { downloadRepoArchive } = require("../../../utils/githubRepo");
    const { resolveProjectRoot } = require("../../../utils/projectRoot");
    const AdmZip = require("adm-zip");

    const archive = await downloadRepoArchive({ owner: parsed.owner, repo: parsed.repo, ref: null }, tempDir);
    const extractDir = path.join(tempDir, "src");
    new AdmZip(archive.zipPath).extractAllTo(extractDir, true);

    const scan = await scanRepositoryDirectory(resolveProjectRoot(extractDir));
    return { owner: parsed.owner, repoName: parsed.repo, defaultBranch: "main", ...scan };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

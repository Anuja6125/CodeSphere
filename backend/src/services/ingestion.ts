import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { db } from "../lib/db";
import { EXTRACTED_DIR } from "./paths";
import { HttpError } from "./errors";

// Existing, working backend utilities (CommonJS).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseGithubUrl, downloadRepoArchive } = require("../../utils/githubRepo");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveProjectRoot } = require("../../utils/projectRoot");

export type GithubRef = { owner: string; repo: string; ref: string | null };

/** Validate a GitHub URL (or "owner/repo"). Throws HttpError 400 when invalid. */
export function parseGithub(input: unknown): GithubRef {
  try {
    return parseGithubUrl(input);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid GitHub URL.");
  }
}

export function canonicalGithubUrl(ref: GithubRef): string {
  return `https://github.com/${ref.owner}/${ref.repo}.git`;
}

function workDir(repositoryId: string): string {
  const dir = path.join(EXTRACTED_DIR, repositoryId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extractZip(zipPath: string, targetDir: string): void {
  try {
    new AdmZip(zipPath).extractAllTo(targetDir, true);
  } catch {
    throw new HttpError(400, "The ZIP file could not be read. Is it a valid .zip?");
  }
}

/** Put the project on disk and return its root folder. */
export async function materializeSource(
  repositoryId: string,
  source: { type: "zip"; zipPath: string } | { type: "github"; ref: GithubRef } | { type: "database" }
): Promise<string> {
  const dir = workDir(repositoryId);
  const extractDir = path.join(dir, "src");

  if (source.type === "zip") {
    extractZip(source.zipPath, extractDir);
  } else if (source.type === "github") {
    const archive = await downloadRepoArchive(source.ref, dir);
    extractZip(archive.zipPath, extractDir);
  } else {
    // Re-analyze a ZIP upload: rebuild the files from what we stored.
    const files = await db.repoFile.findMany({
      where: { repositoryId, isDirectory: false, content: { not: null } },
      select: { path: true, content: true },
    });
    if (files.length === 0) throw new HttpError(409, "No stored files to re-analyze. Upload the ZIP again.");
    for (const file of files) {
      const target = path.join(extractDir, file.path);
      if (!target.startsWith(extractDir + path.sep)) continue; // never write outside the folder
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content ?? "");
    }
  }

  if (!fs.existsSync(extractDir) || fs.readdirSync(extractDir).length === 0) {
    throw new HttpError(400, "The project is empty.");
  }
  return resolveProjectRoot(extractDir);
}

export function cleanupWorkDir(repositoryId: string): void {
  fs.rmSync(path.join(EXTRACTED_DIR, repositoryId), { recursive: true, force: true });
}

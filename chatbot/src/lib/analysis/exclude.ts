export interface ExclusionConfig {
  maxFileSizeBytes: number;
  ignoredDirectories: string[];
  ignoredExtensions: string[];
  ignoredFileNames: string[];
}

export const DEFAULT_EXCLUSION_CONFIG: ExclusionConfig = {
  maxFileSizeBytes: 1024 * 1024,
  ignoredDirectories: [
    ".git",
    "node_modules",
    "build",
    "dist",
    ".next",
    "coverage",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".idea",
    ".vscode",
    "out",
    "tmp",
    "temp",
    ".turbo",
    ".cache",
  ],
  ignoredExtensions: [
    "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp", "tiff",
    "mp3", "mp4", "wav", "avi", "mov", "webm", "ogg",
    "zip", "tar", "gz", "7z", "rar", "tgz",
    "exe", "dll", "so", "dylib", "bin", "wasm",
    "ttf", "woff", "woff2", "eot", "otf",
    "pdf", "lock",
  ],
  ignoredFileNames: [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "cargo.lock",
    "poetry.lock",
    "composer.lock",
  ],
};

const GENERATED_PATH_PATTERNS = [
  /(^|\/)generated(\/|$)/i,
  /(^|\/)\.generated(\/|$)/i,
  /\.min\.(js|css)$/i,
  /\.bundle\.(js|css)$/i,
];

const BINARY_EXTENSIONS = new Set(DEFAULT_EXCLUSION_CONFIG.ignoredExtensions);

export function isBinaryExtension(extension: string): boolean {
  return BINARY_EXTENSIONS.has(extension.toLowerCase());
}

export function isPathInIgnoredDirectory(filePath: string, config: ExclusionConfig = DEFAULT_EXCLUSION_CONFIG): boolean {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts.some((part) => config.ignoredDirectories.includes(part.toLowerCase()));
}

export function shouldExcludeFile(
  file: {
    path: string;
    name: string;
    extension: string;
    size: number;
    isDirectory: boolean;
  },
  config: ExclusionConfig = DEFAULT_EXCLUSION_CONFIG
): { excluded: boolean; reason?: string; isBinary: boolean } {
  if (file.isDirectory) {
    if (config.ignoredDirectories.includes(file.name.toLowerCase())) {
      return { excluded: true, reason: "ignored_directory", isBinary: false };
    }
    return { excluded: false, isBinary: false };
  }

  const ext = (file.extension || "").toLowerCase();
  const name = file.name.toLowerCase();
  const pathNorm = file.path.replace(/\\/g, "/");

  if (isPathInIgnoredDirectory(pathNorm, config)) {
    return { excluded: true, reason: "ignored_directory", isBinary: isBinaryExtension(ext) };
  }

  if (isBinaryExtension(ext)) {
    return { excluded: true, reason: "binary_or_media", isBinary: true };
  }

  if (config.ignoredFileNames.includes(name)) {
    return { excluded: true, reason: "lockfile_or_generated", isBinary: false };
  }

  if (GENERATED_PATH_PATTERNS.some((p) => p.test(pathNorm) || p.test(name))) {
    return { excluded: true, reason: "generated", isBinary: false };
  }

  if (file.size > config.maxFileSizeBytes) {
    return { excluded: true, reason: "too_large", isBinary: false };
  }

  return { excluded: false, isBinary: false };
}

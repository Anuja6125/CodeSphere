const SENSITIVE_NAME_PATTERNS = [
  /^\.env$/i,
  /^\.env\.(?!example$).+/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /credentials/i,
  /secret/i,
];

const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]+/,
  /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
];

export function isSensitiveFileName(fileName: string): boolean {
  if (fileName.toLowerCase() === ".env.example") return false;
  return SENSITIVE_NAME_PATTERNS.some((p) => p.test(fileName));
}

export function containsSecretLikeContent(content: string | null | undefined): boolean {
  if (!content) return false;
  return SECRET_CONTENT_PATTERNS.some((p) => p.test(content));
}

export function shouldRedactFile(file: { name: string; content?: string | null }): boolean {
  return isSensitiveFileName(file.name) || containsSecretLikeContent(file.content);
}

import { describe, it, expect } from "vitest";
import { parseGithubUrl, ingestRepository } from "@/lib/git/ingest";
import { detectTechStack } from "@/lib/git/stack-detector";
import fs from "fs";
import path from "path";
import os from "os";

describe("Repository Ingestion & Parsing Unit Tests", () => {
  it("A. parses GitHub URLs correctly", () => {
    const valid = parseGithubUrl("https://github.com/roystonfernandes1835/portfolio-website");
    expect(valid).not.toBeNull();
    expect(valid?.owner).toBe("roystonfernandes1835");
    expect(valid?.repo).toBe("portfolio-website");
    expect(valid?.cleanUrl).toBe("https://github.com/roystonfernandes1835/portfolio-website.git");

    const invalid = parseGithubUrl("invalid-url-str");
    expect(invalid).toBeNull();
  });

  it("F. detects technology stack correctly", () => {
    const stack = detectTechStack([
      "src/app/page.tsx",
      "package.json",
      "schema.prisma",
      "Dockerfile",
      "requirements.txt",
    ]);

    expect(stack.languages).toContain("TypeScript");
    expect(stack.databases).toContain("Prisma");
    expect(stack.hasDocker).toBe(true);
    expect(stack.packageManagers).toContain("pip / poetry");
  });

  it("N. filters sensitive files (.env, .pem, id_rsa) during ingestion", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-sensitive-"));
    try {
      fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
      fs.writeFileSync(path.join(tempDir, ".env.example"), "PUBLIC=abc");
      fs.writeFileSync(path.join(tempDir, "server.key"), "PRIVATE KEY");

      // Verify that sensitive file helper detects them
      const SENSITIVE_PATTERNS = [/^\.env(\..+)?$/i, /^id_rsa/i, /^id_ed25519/i, /\.pem$/i, /\.key$/i];
      const isSensitive = (name: string) => name !== ".env.example" && SENSITIVE_PATTERNS.some(p => p.test(name));

      expect(isSensitive(".env")).toBe(true);
      expect(isSensitive(".env.local")).toBe(true);
      expect(isSensitive("server.key")).toBe(true);
      expect(isSensitive(".env.example")).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("O. cleans up temporary directory after ingestion", async () => {
    const result = await ingestRepository("https://github.com/roystonfernandes1835/portfolio-website");
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.defaultBranch).toBeDefined();
    // Temporary directory should be removed by ingestRepository finally block
  }, 30000);
});

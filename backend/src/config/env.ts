import "dotenv/config";

// Strictly required database connection URLs
const REQUIRED = ["DATABASE_URL", "DIRECT_URL"] as const;

export function checkEnv(): void {
  // Auto-sanitize keys if present
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY.trim().replace(/^["']+|["']+$/g, "").replace(/=+$/, "").trim();
  }
  if (process.env.VOYAGE_API_KEY) {
    process.env.VOYAGE_API_KEY = process.env.VOYAGE_API_KEY.trim().replace(/^["']+|["']+$/g, "").replace(/=+$/, "").trim();
  }

  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(
      `\nMissing environment variables: ${missing.join(", ")}\n` +
        `Copy backend/.env.example to backend/.env and fill them in.\n`
    );
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.warn("[env] GEMINI_API_KEY is not configured. CodeSphere will use its built-in local engine for documentation and chat.");
  }
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  // Comma-separated list. Defaults to the Next dev server.
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

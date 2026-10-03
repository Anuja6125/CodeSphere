import "dotenv/config";

// The app cannot work without these. Fail at startup, not on the first request.
const REQUIRED = ["DATABASE_URL", "DIRECT_URL", "GEMINI_API_KEY", "VOYAGE_API_KEY"] as const;

export function checkEnv(): void {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(
      `\nMissing environment variables: ${missing.join(", ")}\n` +
        `Copy backend/.env.example to backend/.env and fill them in.\n`
    );
    process.exit(1);
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

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
  auth: {
    jwtSecret: process.env.JWT_SECRET || "codesphere-jwt-secret-key-32-chars-dev-mode",
    otpSecret: process.env.OTP_SECRET || "codesphere-otp-secret-salt-hmac-dev-mode",
    jwtExpiresIn: "7d",
    cookieName: "codesphere_token",
    sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    otpExpiryMinutes: 5,
    otpCooldownSeconds: 60,
    maxVerifyAttempts: 5,
    maxRequestsPerWindow: 5,
    rateLimitWindowMs: 15 * 60 * 1000, // 15 mins
    bootstrapManagerEmail: process.env.BOOTSTRAP_MANAGER_EMAIL || "",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || process.env.SOURCE_EMAIL || "",
    pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
    from: process.env.EMAIL_FROM || (process.env.SOURCE_EMAIL ? `CodeSphere <${process.env.SOURCE_EMAIL}>` : "CodeSphere <codesphere.analytics@gmail.com>"),
    sourceEmail: process.env.SOURCE_EMAIL || "codesphere.analytics@gmail.com",
  },
};

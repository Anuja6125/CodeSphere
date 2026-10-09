import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../lib/db";
import { config } from "../config/env";
import { sendOtpEmail } from "./email";
import { User, UserRole } from "@prisma/client";

export interface UserSessionPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Generate a cryptographically secure 6-digit OTP string.
 */
export function generateOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash an OTP using HMAC-SHA256 with the server OTP secret.
 */
export function hashOtp(otp: string): string {
  return crypto.createHmac("sha256", config.auth.otpSecret).update(otp.trim()).digest("hex");
}

export class AuthError extends Error {
  statusCode: number;
  code?: string;
  remainingAttempts?: number;
  cooldownSeconds?: number;

  constructor(message: string, statusCode = 400, code?: string, extra?: { remainingAttempts?: number; cooldownSeconds?: number }) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
    if (extra?.remainingAttempts !== undefined) this.remainingAttempts = extra.remainingAttempts;
    if (extra?.cooldownSeconds !== undefined) this.cooldownSeconds = extra.cooldownSeconds;
  }
}

/**
 * Request an OTP for a given email address.
 * Validates cooldown and window rate limits, creates an active OTP record, and sends email.
 */
export async function requestOtp(emailRaw: string): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
  const email = emailRaw.trim().toLowerCase();

  // Basic email syntax validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new AuthError("Please provide a valid email address.", 400, "INVALID_EMAIL");
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - config.auth.rateLimitWindowMs);

  // Check rate limit: recent OTPs requested in the rate limit window
  const recentOtps = await db.emailOtp.findMany({
    where: {
      email,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: "desc" },
  });

  // 1. Check cooldown (e.g. 60 seconds)
  if (recentOtps.length > 0) {
    const latestOtp = recentOtps[0];
    const msSinceLatest = now.getTime() - latestOtp.createdAt.getTime();
    const cooldownMs = config.auth.otpCooldownSeconds * 1000;

    if (msSinceLatest < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - msSinceLatest) / 1000);
      throw new AuthError(`Please wait ${waitSec} second(s) before requesting a new code.`, 429, "RATE_LIMIT_COOLDOWN", {
        cooldownSeconds: waitSec,
      });
    }
  }

  // 2. Check window rate limit (e.g. max 5 OTPs per 15 minutes)
  if (recentOtps.length >= config.auth.maxRequestsPerWindow) {
    throw new AuthError("Too many OTP requests for this email. Please try again in 15 minutes.", 429, "RATE_LIMIT_EXCEEDED");
  }

  // Invalidate any existing unconsumed active OTPs for this email to enforce single-active-OTP
  await db.emailOtp.updateMany({
    where: {
      email,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now, // mark consumed/invalidated
    },
  });

  // Generate OTP and compute hash
  const rawOtp = generateOtpCode();
  const otpHash = hashOtp(rawOtp);
  const expiresAt = new Date(now.getTime() + config.auth.otpExpiryMinutes * 60 * 1000);

  // Persist to database (storing only hash)
  await db.emailOtp.create({
    data: {
      email,
      otpHash,
      expiresAt,
      attempts: 0,
    },
  });

  // Send the email with the raw OTP (never returning or persisting raw code)
  await sendOtpEmail({
    email,
    otp: rawOtp,
    expiresInMinutes: config.auth.otpExpiryMinutes,
  });

  return {
    success: true,
    message: "Verification code sent to your email.",
    cooldownSeconds: config.auth.otpCooldownSeconds,
  };
}

/**
 * Verify an OTP for an email address.
 * Validates expiration, single-use, max attempts, and creates/retrieves User.
 */
export async function verifyOtp(
  emailRaw: string,
  codeRaw: string
): Promise<{ user: User; token: string }> {
  const email = emailRaw.trim().toLowerCase();
  const code = (codeRaw || "").trim();

  if (!email || !code || !/^\d{6}$/.test(code)) {
    throw new AuthError("Please provide a valid 6-digit verification code.", 400, "INVALID_CODE_FORMAT");
  }

  const now = new Date();

  // Find the latest active OTP for this email
  const latestOtp = await db.emailOtp.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (!latestOtp) {
    throw new AuthError("No verification code found for this email. Please request a new code.", 400, "NO_OTP_FOUND");
  }

  // Check if code was already used
  if (latestOtp.consumedAt !== null) {
    throw new AuthError("This verification code has already been used. Please request a new code.", 400, "OTP_ALREADY_USED");
  }

  // Check if code has expired (5-minute expiry)
  if (now > latestOtp.expiresAt) {
    throw new AuthError("This verification code has expired. Please request a new one.", 400, "OTP_EXPIRED");
  }

  // Check attempts
  if (latestOtp.attempts >= config.auth.maxVerifyAttempts) {
    // Invalidate the code
    await db.emailOtp.update({
      where: { id: latestOtp.id },
      data: { consumedAt: now },
    });
    throw new AuthError("Too many incorrect attempts. This code is now invalid. Please request a new code.", 400, "MAX_ATTEMPTS_EXCEEDED");
  }

  // Verify hash
  const computedHash = hashOtp(code);
  const isValid = crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(latestOtp.otpHash, "hex"));

  if (!isValid) {
    // Increment attempts
    const updatedAttempts = latestOtp.attempts + 1;
    const remaining = config.auth.maxVerifyAttempts - updatedAttempts;

    await db.emailOtp.update({
      where: { id: latestOtp.id },
      data: {
        attempts: updatedAttempts,
        consumedAt: remaining <= 0 ? now : null,
      },
    });

    if (remaining <= 0) {
      throw new AuthError("Too many incorrect attempts. This code is now invalid. Please request a new code.", 400, "MAX_ATTEMPTS_EXCEEDED", {
        remainingAttempts: 0,
      });
    }

    throw new AuthError(`Invalid verification code. ${remaining} attempt(s) remaining.`, 400, "INVALID_CODE", {
      remainingAttempts: remaining,
    });
  }

  // Successfully verified! Find or create user with default role 'USER'
  let user = await db.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        email,
        role: UserRole.EMPLOYEE, // Safe default role
      },
    });
  }

  // Mark OTP consumed and link to user
  await db.emailOtp.update({
    where: { id: latestOtp.id },
    data: {
      consumedAt: now,
      userId: user.id,
    },
  });

  // Generate JWT token
  const payload: UserSessionPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn as any,
  });

  return { user, token };
}

/**
 * Verify a JWT token and retrieve the user session payload.
 */
export function verifyToken(token: string): UserSessionPayload {
  try {
    return jwt.verify(token, config.auth.jwtSecret) as UserSessionPayload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new AuthError("Session expired. Please log in again.", 401, "SESSION_EXPIRED");
    }
    throw new AuthError("Invalid authentication token.", 401, "INVALID_TOKEN");
  }
}

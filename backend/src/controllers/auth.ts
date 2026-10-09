import { Response } from "express";
import { requestOtp, verifyOtp as verifyOtpService, AuthError } from "../services/auth";
import { AuthenticatedRequest } from "../middleware/auth";
import { config } from "../config/env";
import { db } from "../lib/db";

/**
 * Helper to set the session cookie with secure properties.
 */
function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: config.auth.sessionMaxAgeMs,
    path: "/",
  });
}

/**
 * POST /api/auth/send-otp
 * Body: { email: string }
 */
export async function sendOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email } = req.body || {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required.", code: "INVALID_EMAIL" });
    return;
  }

  try {
    const result = await requestOtp(email);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        cooldownSeconds: error.cooldownSeconds,
      });
      return;
    }
    console.error("sendOtp unexpected error:", error);
    res.status(500).json({ error: "Failed to send verification code. Please try again later." });
  }
}

/**
 * POST /api/auth/verify-otp
 * Body: { email: string, code: string }
 */
export async function verifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email, code } = req.body || {};

  if (!email || typeof email !== "string" || !code || typeof code !== "string") {
    res.status(400).json({ error: "Email and 6-digit verification code are required.", code: "INVALID_INPUT" });
    return;
  }

  try {
    const { user, token } = await verifyOtpService(email, code);

    // Set secure HTTP-only cookie
    setSessionCookie(res, token);

    res.status(200).json({
      success: true,
      message: "Successfully authenticated.",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        remainingAttempts: error.remainingAttempts,
      });
      return;
    }
    console.error("verifyOtp unexpected error:", error);
    res.status(500).json({ error: "Failed to verify code. Please try again later." });
  }
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated user
 */
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated.", code: "UNAUTHORIZED" });
    return;
  }

  const user = await db.user.findUnique({
    where: { id: req.user.sub },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });
    return;
  }

  res.status(200).json({ user });
}

/**
 * POST /api/auth/logout
 * Clears the session cookie
 */
export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });

  res.status(200).json({ success: true, message: "Logged out successfully." });
}

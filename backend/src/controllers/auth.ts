import { Response } from "express";
import {
  requestOtp,
  verifyOtp as verifyOtpService,
  requestSignupOtp,
  verifySignupOtp,
  completeSignup,
  loginWithPassword,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  AuthError,
} from "../services/auth";
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

/**
 * POST /api/auth/signup/send-otp
 * Body: { name: string, email: string }
 */
export async function signupSendOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, email } = req.body || {};

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Full name is required.", code: "INVALID_NAME" });
    return;
  }

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required.", code: "INVALID_EMAIL" });
    return;
  }

  try {
    const result = await requestSignupOtp({ name, email });
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
    console.error("signupSendOtp unexpected error:", error);
    res.status(500).json({ error: "Failed to send verification code. Please try again later." });
  }
}

/**
 * POST /api/auth/signup/verify-otp
 * Body: { email: string, code: string, name?: string }
 */
export async function signupVerifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email, code, name } = req.body || {};

  if (!email || typeof email !== "string" || !code || typeof code !== "string") {
    res.status(400).json({ error: "Email and 6-digit verification code are required.", code: "INVALID_INPUT" });
    return;
  }

  try {
    const result = await verifySignupOtp({ email, code, name });
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        remainingAttempts: error.remainingAttempts,
      });
      return;
    }
    console.error("signupVerifyOtp unexpected error:", error);
    res.status(500).json({ error: "Failed to verify code. Please try again later." });
  }
}

/**
 * POST /api/auth/signup/complete
 * Body: { signupToken: string, password: string, name?: string }
 */
export async function signupComplete(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { signupToken, password, name } = req.body || {};

  if (!signupToken || typeof signupToken !== "string") {
    res.status(400).json({ error: "Signup verification token is required.", code: "INVALID_SIGNUP_TOKEN" });
    return;
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long.", code: "INVALID_PASSWORD" });
    return;
  }

  const { confirmPassword } = req.body || {};
  if (confirmPassword !== undefined && confirmPassword !== password) {
    res.status(400).json({ error: "Passwords do not match.", code: "PASSWORD_MISMATCH" });
    return;
  }

  try {
    const result = await completeSignup({ signupToken, password, name });
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    console.error("signupComplete unexpected error:", error);
    res.status(500).json({ error: "Failed to create account. Please try again later." });
  }
}

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 */
export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email, password } = req.body || {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required.", code: "INVALID_EMAIL" });
    return;
  }

  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required.", code: "INVALID_PASSWORD" });
    return;
  }

  try {
    const { user, token } = await loginWithPassword({ email, password });

    setSessionCookie(res, token);

    res.status(200).json({
      success: true,
      message: "Logged in successfully.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    console.error("login unexpected error:", error);
    res.status(500).json({ error: "Authentication failed. Please try again later." });
  }
}

/**
 * POST /api/auth/forgot-password/send-otp
 * Body: { email: string }
 */
export async function forgotPasswordSendOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email } = req.body || {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required.", code: "INVALID_EMAIL" });
    return;
  }

  try {
    const result = await requestForgotPasswordOtp(email);
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
    console.error("forgotPasswordSendOtp unexpected error:", error);
    res.status(500).json({ error: "Failed to send reset code. Please try again later." });
  }
}

/**
 * POST /api/auth/forgot-password/verify-otp
 * Body: { email: string, code: string }
 */
export async function forgotPasswordVerifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email, code } = req.body || {};

  if (!email || typeof email !== "string" || !code || typeof code !== "string") {
    res.status(400).json({ error: "Email and 6-digit verification code are required.", code: "INVALID_INPUT" });
    return;
  }

  try {
    const result = await verifyForgotPasswordOtp({ email, code });
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        remainingAttempts: error.remainingAttempts,
      });
      return;
    }
    console.error("forgotPasswordVerifyOtp unexpected error:", error);
    res.status(500).json({ error: "Failed to verify reset code. Please try again later." });
  }
}

/**
 * POST /api/auth/forgot-password/reset
 * Body: { resetToken: string, password: string, confirmPassword?: string }
 */
export async function forgotPasswordReset(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { resetToken, password, confirmPassword } = req.body || {};

  if (!resetToken || typeof resetToken !== "string") {
    res.status(400).json({ error: "Reset token is required.", code: "INVALID_RESET_TOKEN" });
    return;
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long.", code: "INVALID_PASSWORD" });
    return;
  }

  if (confirmPassword !== undefined && confirmPassword !== password) {
    res.status(400).json({ error: "Passwords do not match.", code: "PASSWORD_MISMATCH" });
    return;
  }

  try {
    const result = await resetPassword({ resetToken, password });

    // Invalidate any existing session cookie
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie(config.auth.cookieName, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    });

    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    console.error("forgotPasswordReset unexpected error:", error);
    res.status(500).json({ error: "Failed to reset password. Please try again later." });
  }
}


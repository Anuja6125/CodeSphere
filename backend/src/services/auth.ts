import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { config } from "../config/env";
import { sendOtpEmail } from "./email";
import { User, UserRole, OtpPurpose } from "@prisma/client";


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

/**
 * Hash a password using bcrypt with 12 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a plain text password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface RequestSignupOtpParams {
  name: string;
  email: string;
}

/**
 * Initiates the new signup flow:
 * 1. Validates name and email syntax.
 * 2. Checks for duplicate accounts (preventing re-registration of existing emails).
 * 3. Enforces cooldown and rate limits.
 * 4. Generates and sends a 6-digit OTP code bound to purpose SIGNUP.
 */
export async function requestSignupOtp({
  name: rawName,
  email: rawEmail,
}: RequestSignupOtpParams): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
  const name = (rawName || "").trim();
  const email = (rawEmail || "").trim().toLowerCase();

  if (!name || name.length < 2) {
    throw new AuthError("Please provide your full name (at least 2 characters).", 400, "INVALID_NAME");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new AuthError("Please provide a valid email address.", 400, "INVALID_EMAIL");
  }

  // Prevent duplicate accounts
  const existingUser = await db.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    throw new AuthError("An account with this email already exists. Please sign in.", 400, "ACCOUNT_EXISTS");
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

  // 1. Check cooldown (60 seconds)
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

  // 2. Check window rate limit (max 5 OTPs per 15 minutes)
  if (recentOtps.length >= config.auth.maxRequestsPerWindow) {
    throw new AuthError("Too many OTP requests for this email. Please try again in 15 minutes.", 429, "RATE_LIMIT_EXCEEDED");
  }

  // Invalidate any existing unconsumed active signup OTPs for this email to enforce single-active-OTP
  await db.emailOtp.updateMany({
    where: {
      email,
      purpose: "SIGNUP",
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
    },
  });

  // Generate 6-digit OTP and compute hash
  const rawOtp = generateOtpCode();
  const otpHash = hashOtp(rawOtp);
  const expiresAt = new Date(now.getTime() + config.auth.otpExpiryMinutes * 60 * 1000);

  // Store hashed OTP in database
  await db.emailOtp.create({
    data: {
      email,
      otpHash,
      purpose: "SIGNUP",
      expiresAt,
      attempts: 0,
    },
  });

  // Dispatch email with raw OTP
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

export interface VerifySignupOtpParams {
  email: string;
  code: string;
  name?: string;
}

/**
 * Verifies the 6-digit signup OTP.
 * Validates expiration, single-use, max attempts, and issues a cryptographically
 * signed signupToken valid for 15 minutes that is strictly bound to this email and OTP record.
 */
export async function verifySignupOtp({
  email: rawEmail,
  code: rawCode,
  name: rawName,
}: VerifySignupOtpParams): Promise<{ success: boolean; message: string; signupToken: string; email: string }> {
  const email = (rawEmail || "").trim().toLowerCase();
  const code = (rawCode || "").trim();
  const name = (rawName || "").trim();

  if (!email || !code || !/^\d{6}$/.test(code)) {
    throw new AuthError("Please provide a valid 6-digit verification code.", 400, "INVALID_CODE_FORMAT");
  }

  const existingUser = await db.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    throw new AuthError("An account with this email already exists. Please sign in.", 400, "ACCOUNT_EXISTS");
  }

  const now = new Date();

  // Find latest signup OTP for this email
  const latestOtp = await db.emailOtp.findFirst({
    where: { email, purpose: "SIGNUP" },
    orderBy: { createdAt: "desc" },
  });

  if (!latestOtp) {
    throw new AuthError("No verification code found for this email. Please request a new code.", 400, "NO_OTP_FOUND");
  }

  if (latestOtp.consumedAt !== null) {
    throw new AuthError("This verification code has already been used. Please request a new code.", 400, "OTP_ALREADY_USED");
  }

  if (now > latestOtp.expiresAt) {
    throw new AuthError("This verification code has expired. Please request a new one.", 400, "OTP_EXPIRED");
  }

  if (latestOtp.attempts >= config.auth.maxVerifyAttempts) {
    await db.emailOtp.update({
      where: { id: latestOtp.id },
      data: { consumedAt: now },
    });
    throw new AuthError("Too many incorrect attempts. This code is now invalid. Please request a new code.", 400, "MAX_ATTEMPTS_EXCEEDED");
  }

  // Constant-time hash verification
  const computedHash = hashOtp(code);
  const isValid = crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(latestOtp.otpHash, "hex"));

  if (!isValid) {
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

  // Invalidate this OTP from future verifications
  await db.emailOtp.update({
    where: { id: latestOtp.id },
    data: { consumedAt: now },
  });

  // Issue a signed signupToken bound to this verified email and OTP ID
  const signupToken = jwt.sign(
    {
      email,
      name: name || undefined,
      otpId: latestOtp.id,
      purpose: "SIGNUP_VERIFIED",
    },
    config.auth.jwtSecret,
    { expiresIn: "15m" }
  );

  return {
    success: true,
    message: "Email verified successfully.",
    signupToken,
    email,
  };
}

export interface CompleteSignupParams {
  signupToken: string;
  password: string;
  name?: string;
}

/**
 * Completes account creation after OTP verification:
 * 1. Cryptographically verifies signupToken.
 * 2. Ensures OTP was not already consumed for account creation.
 * 3. Enforces password security requirements (minimum 8 characters).
 * 4. Hashes password with bcrypt (12 rounds).
 * 5. Creates user record with name, email, passwordHash, role: EMPLOYEE.
 * 6. Permanently links OTP to user ID.
 */
export async function completeSignup({
  signupToken,
  password: rawPassword,
  name: explicitName,
}: CompleteSignupParams): Promise<{
  success: boolean;
  message: string;
  user: { id: string; email: string; name: string | null; role: UserRole };
}> {
  if (!signupToken || typeof signupToken !== "string") {
    throw new AuthError("Missing or invalid signup verification token.", 400, "INVALID_SIGNUP_TOKEN");
  }

  let payload: any;
  try {
    payload = jwt.verify(signupToken, config.auth.jwtSecret);
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new AuthError("Signup verification session expired. Please verify your email again.", 400, "SIGNUP_TOKEN_EXPIRED");
    }
    throw new AuthError("Invalid signup verification token. Please verify your email again.", 400, "INVALID_SIGNUP_TOKEN");
  }

  if (payload.purpose !== "SIGNUP_VERIFIED" || !payload.email || !payload.otpId) {
    throw new AuthError("Invalid signup verification token. Please verify your email again.", 400, "INVALID_SIGNUP_TOKEN");
  }

  const email = payload.email.trim().toLowerCase();
  const name = (explicitName || payload.name || "").trim();

  // Validate password
  const password = rawPassword || "";
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters long.", 400, "INVALID_PASSWORD");
  }

  // Prevent duplicate accounts
  const existingUser = await db.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    throw new AuthError("An account with this email already exists. Please sign in.", 400, "ACCOUNT_EXISTS");
  }

  // Verify that the OTP record exists and hasn't already been used to create an account
  const otpRecord = await db.emailOtp.findUnique({
    where: { id: payload.otpId },
  });
  if (!otpRecord) {
    throw new AuthError("Verification record not found. Please restart signup.", 400, "NO_OTP_FOUND");
  }
  if (otpRecord.userId !== null) {
    throw new AuthError("This verification code has already been used to create an account.", 400, "VERIFICATION_ALREADY_USED");
  }

  // Securely hash password
  const passwordHash = await hashPassword(password);

  // Securely create user account
  const user = await db.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      role: UserRole.EMPLOYEE,
    },
  });

  // Permanently bind OTP to the created user
  await db.emailOtp.update({
    where: { id: otpRecord.id },
    data: { userId: user.id },
  });

  return {
    success: true,
    message: "Account created successfully. You can now proceed to login.",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

/**
 * Authenticate a user with email and password.
 * Establishes session token and returns user details.
 * Detects accounts without passwords and guides them to password setup.
 */
export async function loginWithPassword(params: {
  email: string;
  password: string;
}): Promise<{ user: User; token: string }> {
  const email = (params.email || "").trim().toLowerCase();
  const password = params.password || "";

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new AuthError("Please provide a valid email address.", 400, "INVALID_EMAIL");
  }

  if (!password) {
    throw new AuthError("Please provide your password.", 400, "INVALID_PASSWORD");
  }

  const user = await db.user.findUnique({
    where: { email },
  });

  // Generic message to prevent email enumeration
  if (!user) {
    throw new AuthError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  // Account exists, but has no password (e.g. legacy OTP-only user)
  if (!user.passwordHash) {
    throw new AuthError(
      "This account was created without a password. Please use 'Forgot Password / Set Up Password' to create your password via email verification.",
      400,
      "PASSWORD_SETUP_REQUIRED"
    );
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AuthError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

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
 * Request an OTP to initiate password reset / initial password setup.
 * Enforces cooldown (60s) and window rate limits (5/15m).
 * Generates OTP with purpose FORGOT_PASSWORD and sends email.
 */
export async function requestForgotPasswordOtp(
  emailRaw: string
): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
  const email = (emailRaw || "").trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new AuthError("Please provide a valid email address.", 400, "INVALID_EMAIL");
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - config.auth.rateLimitWindowMs);

  // Check rate limit: recent FORGOT_PASSWORD OTPs requested
  const recentOtps = await db.emailOtp.findMany({
    where: {
      email,
      purpose: OtpPurpose.FORGOT_PASSWORD,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: "desc" },
  });

  // 1. Cooldown check
  if (recentOtps.length > 0) {
    const latestOtp = recentOtps[0];
    const msSinceLatest = now.getTime() - latestOtp.createdAt.getTime();
    const cooldownMs = config.auth.otpCooldownSeconds * 1000;

    if (msSinceLatest < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - msSinceLatest) / 1000);
      throw new AuthError(
        `Please wait ${waitSec} second(s) before requesting a new code.`,
        429,
        "RATE_LIMIT_COOLDOWN",
        { cooldownSeconds: waitSec }
      );
    }
  }

  // 2. Window limit check
  if (recentOtps.length >= config.auth.maxRequestsPerWindow) {
    throw new AuthError(
      "Too many OTP requests for this email. Please try again in 15 minutes.",
      429,
      "RATE_LIMIT_EXCEEDED"
    );
  }

  // Check if account exists
  const user = await db.user.findUnique({
    where: { email },
  });

  // To protect privacy, if user doesn't exist, return success response without creating an OTP
  if (!user) {
    return {
      success: true,
      message: "If an account with this email exists, a verification code has been sent.",
      cooldownSeconds: config.auth.otpCooldownSeconds,
    };
  }

  // Invalidate any existing active FORGOT_PASSWORD OTPs for this email
  await db.emailOtp.updateMany({
    where: {
      email,
      purpose: OtpPurpose.FORGOT_PASSWORD,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
    },
  });

  const rawOtp = generateOtpCode();
  const otpHash = hashOtp(rawOtp);
  const expiresAt = new Date(now.getTime() + config.auth.otpExpiryMinutes * 60 * 1000);

  await db.emailOtp.create({
    data: {
      email,
      otpHash,
      purpose: OtpPurpose.FORGOT_PASSWORD,
      expiresAt,
      attempts: 0,
    },
  });

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
 * Verify an OTP sent for password reset.
 * Validates expiration, max attempts, marks consumed, and issues a resetToken.
 */
export async function verifyForgotPasswordOtp(params: {
  email: string;
  code: string;
}): Promise<{ success: boolean; message: string; resetToken: string; email: string }> {
  const email = (params.email || "").trim().toLowerCase();
  const code = (params.code || "").trim();

  if (!email || !code || !/^\d{6}$/.test(code)) {
    throw new AuthError("Please provide a valid 6-digit verification code.", 400, "INVALID_CODE_FORMAT");
  }

  const now = new Date();

  const latestOtp = await db.emailOtp.findFirst({
    where: {
      email,
      purpose: OtpPurpose.FORGOT_PASSWORD,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestOtp) {
    throw new AuthError("No verification code found for this email. Please request a new code.", 400, "NO_OTP_FOUND");
  }

  if (latestOtp.consumedAt !== null) {
    throw new AuthError("This verification code has already been used. Please request a new code.", 400, "OTP_ALREADY_USED");
  }

  if (now > latestOtp.expiresAt) {
    throw new AuthError("This verification code has expired. Please request a new one.", 400, "OTP_EXPIRED");
  }

  if (latestOtp.attempts >= config.auth.maxVerifyAttempts) {
    await db.emailOtp.update({
      where: { id: latestOtp.id },
      data: { consumedAt: now },
    });
    throw new AuthError("Too many incorrect attempts. This code is now invalid. Please request a new code.", 400, "MAX_ATTEMPTS_EXCEEDED");
  }

  const computedHash = hashOtp(code);
  const isValid = crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(latestOtp.otpHash, "hex"));

  if (!isValid) {
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

  // Mark consumed immediately
  await db.emailOtp.update({
    where: { id: latestOtp.id },
    data: { consumedAt: now },
  });

  const resetToken = jwt.sign(
    {
      email,
      otpId: latestOtp.id,
      purpose: "RESET_PASSWORD_VERIFIED",
    },
    config.auth.jwtSecret,
    { expiresIn: "15m" }
  );

  return {
    success: true,
    message: "Email verified. You may now reset your password.",
    resetToken,
    email,
  };
}

/**
 * Reset / Set a new password using a verified resetToken.
 * Hashes the new password with bcrypt and binds the OTP to prevent replay.
 */
export async function resetPassword(params: {
  resetToken: string;
  password: string;
}): Promise<{ success: boolean; message: string }> {
  const { resetToken, password: rawPassword } = params;

  if (!resetToken || typeof resetToken !== "string") {
    throw new AuthError("Missing or invalid password reset token.", 400, "INVALID_RESET_TOKEN");
  }

  let payload: any;
  try {
    payload = jwt.verify(resetToken, config.auth.jwtSecret);
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new AuthError("Password reset session expired. Please verify your email again.", 400, "RESET_TOKEN_EXPIRED");
    }
    throw new AuthError("Invalid password reset token. Please verify your email again.", 400, "INVALID_RESET_TOKEN");
  }

  if (payload.purpose !== "RESET_PASSWORD_VERIFIED" || !payload.email || !payload.otpId) {
    throw new AuthError("Invalid password reset token. Please verify your email again.", 400, "INVALID_RESET_TOKEN");
  }

  const email = payload.email.trim().toLowerCase();
  const password = rawPassword || "";

  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters long.", 400, "INVALID_PASSWORD");
  }

  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AuthError("Account not found. Please sign up or contact support.", 404, "USER_NOT_FOUND");
  }

  const otpRecord = await db.emailOtp.findUnique({
    where: { id: payload.otpId },
  });

  if (!otpRecord) {
    throw new AuthError("Verification record not found. Please restart password reset.", 400, "NO_OTP_FOUND");
  }

  if (otpRecord.userId !== null) {
    throw new AuthError("This verification session has already been used to update a password.", 400, "VERIFICATION_ALREADY_USED");
  }

  const passwordHash = await hashPassword(password);

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // Permanently bind OTP to the user so it can never be reused
  await db.emailOtp.update({
    where: { id: otpRecord.id },
    data: { userId: user.id },
  });

  return {
    success: true,
    message: "Password updated successfully. You can now log in with your new password.",
  };
}


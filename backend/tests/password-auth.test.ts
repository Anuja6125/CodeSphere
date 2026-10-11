import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loginWithPassword,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  hashPassword,
  verifyPassword,
  hashOtp,
  verifyToken,
  AuthError,
} from "../src/services/auth";
import { login, forgotPasswordSendOtp, forgotPasswordVerifyOtp, forgotPasswordReset, logout } from "../src/controllers/auth";
import { db } from "../src/lib/db";
import { config } from "../src/config/env";
import { OtpPurpose } from "@prisma/client";
import jwt from "jsonwebtoken";

describe("Phase 2: Password-Based Authentication & Account Recovery Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    res.clearCookie = vi.fn().mockReturnValue(res);
    return res;
  };

  describe("1. Normal Password Login", () => {
    it("authenticates user with valid email and password and returns session token", async () => {
      const password = "MySecurePassword123!";
      const passwordHash = await hashPassword(password);

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-123",
        email: "alice@codesphere.io",
        name: "Alice",
        passwordHash,
        createdAt: new Date(),
      } as any);

      const result = await loginWithPassword({
        email: "alice@codesphere.io",
        password,
      });

      expect(result.user.id).toBe("user-123");
      expect(result.user.email).toBe("alice@codesphere.io");
      expect(result.token).toBeDefined();

      // Verify token payload
      const session = verifyToken(result.token);
      expect(session.sub).toBe("user-123");
      expect(session.email).toBe("alice@codesphere.io");
    });

    it("rejects login with incorrect password with generic error message", async () => {
      const passwordHash = await hashPassword("RealPassword123!");

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-123",
        email: "alice@codesphere.io",
        passwordHash,
      } as any);

      await expect(
        loginWithPassword({
          email: "alice@codesphere.io",
          password: "WrongPassword123!",
        })
      ).rejects.toThrow("Invalid email or password.");
    });

    it("rejects non-existent user with generic error message to prevent email enumeration", async () => {
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);

      await expect(
        loginWithPassword({
          email: "ghost@codesphere.io",
          password: "SomePassword123!",
        })
      ).rejects.toThrow("Invalid email or password.");
    });

    it("validates input formats (invalid email, missing password)", async () => {
      await expect(
        loginWithPassword({ email: "invalid-email", password: "Password123!" })
      ).rejects.toThrow("Please provide a valid email address.");

      await expect(
        loginWithPassword({ email: "alice@codesphere.io", password: "" })
      ).rejects.toThrow("Please provide your password.");
    });
  });

  describe("2. Existing OTP-Only Accounts Handling", () => {
    it("detects existing user without password and throws PASSWORD_SETUP_REQUIRED", async () => {
      // Legacy user who signed up with OTP and has null passwordHash
      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "legacy-user-456",
        email: "legacy@codesphere.io",
        name: "Legacy User",
        passwordHash: null,
      } as any);

      try {
        await loginWithPassword({
          email: "legacy@codesphere.io",
          password: "RandomPassword123!",
        });
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(AuthError);
        expect(err.code).toBe("PASSWORD_SETUP_REQUIRED");
        expect(err.message).toContain("This account was created without a password");
      }
    });

    it("does not grant access merely because someone submits an existing email", async () => {
      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "legacy-user-456",
        email: "legacy@codesphere.io",
        passwordHash: null,
      } as any);

      await expect(
        loginWithPassword({
          email: "legacy@codesphere.io",
          password: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("3. Forgot Password OTP Request & Verification", () => {
    it("enforces 60-second cooldown on forgot password OTP requests", async () => {
      const now = new Date();
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([
        {
          id: "otp-fp-1",
          email: "alice@codesphere.io",
          purpose: OtpPurpose.FORGOT_PASSWORD,
          createdAt: new Date(now.getTime() - 20 * 1000), // 20s ago
        } as any,
      ]);

      await expect(
        requestForgotPasswordOtp("alice@codesphere.io")
      ).rejects.toThrow(/Please wait \d+ second\(s\) before requesting a new code/);
    });

    it("enforces rate limit window (max 5 requests per 15 minutes)", async () => {
      const now = new Date();
      const recentOtps = Array.from({ length: 5 }, (_, i) => ({
        id: `otp-fp-${i}`,
        email: "alice@codesphere.io",
        purpose: OtpPurpose.FORGOT_PASSWORD,
        createdAt: new Date(now.getTime() - (i + 2) * 60 * 1000),
      } as any));

      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue(recentOtps);

      await expect(
        requestForgotPasswordOtp("alice@codesphere.io")
      ).rejects.toThrow("Too many OTP requests for this email. Please try again in 15 minutes.");
    });

    it("returns friendly generic success for non-existent email without creating OTP", async () => {
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([]);
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      const createSpy = vi.spyOn(db.emailOtp, "create");

      const res = await requestForgotPasswordOtp("nonexistent@codesphere.io");
      expect(res.success).toBe(true);
      expect(res.message).toContain("If an account with this email exists");
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("generates OTP with purpose FORGOT_PASSWORD and invalidates prior active OTPs", async () => {
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([]);
      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-123",
        email: "alice@codesphere.io",
      } as any);

      const updateManySpy = vi.spyOn(db.emailOtp, "updateMany").mockResolvedValue({ count: 1 });
      const createSpy = vi.spyOn(db.emailOtp, "create").mockResolvedValue({} as any);

      const res = await requestForgotPasswordOtp("alice@codesphere.io");
      expect(res.success).toBe(true);
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: "alice@codesphere.io",
            purpose: OtpPurpose.FORGOT_PASSWORD,
          }),
        })
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "alice@codesphere.io",
            purpose: OtpPurpose.FORGOT_PASSWORD,
          }),
        })
      );
    });

    it("rejects invalid code format or expired forgot-password OTP", async () => {
      await expect(
        verifyForgotPasswordOtp({ email: "alice@codesphere.io", code: "12" })
      ).rejects.toThrow("Please provide a valid 6-digit verification code.");

      const now = new Date();
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-fp-expired",
        email: "alice@codesphere.io",
        purpose: OtpPurpose.FORGOT_PASSWORD,
        consumedAt: null,
        expiresAt: new Date(now.getTime() - 1000), // Expired
        attempts: 0,
        otpHash: hashOtp("123456"),
      } as any);

      await expect(
        verifyForgotPasswordOtp({ email: "alice@codesphere.io", code: "123456" })
      ).rejects.toThrow("This verification code has expired. Please request a new one.");
    });

    it("locks and invalidates OTP after 5 failed verification attempts", async () => {
      const now = new Date();
      const updateSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-fp-attempt",
        email: "alice@codesphere.io",
        purpose: OtpPurpose.FORGOT_PASSWORD,
        consumedAt: null,
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        attempts: 4, // 5th attempt will fail
        otpHash: hashOtp("111111"),
      } as any);

      await expect(
        verifyForgotPasswordOtp({ email: "alice@codesphere.io", code: "999999" })
      ).rejects.toThrow("Too many incorrect attempts. This code is now invalid.");

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "otp-fp-attempt" },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      });
    });

    it("verifies OTP, marks consumed, and returns signed resetToken", async () => {
      const now = new Date();
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-fp-valid",
        email: "alice@codesphere.io",
        purpose: OtpPurpose.FORGOT_PASSWORD,
        consumedAt: null,
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        attempts: 0,
        otpHash: hashOtp("654321"),
      } as any);

      const updateSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      const res = await verifyForgotPasswordOtp({
        email: "alice@codesphere.io",
        code: "654321",
      });

      expect(res.success).toBe(true);
      expect(res.resetToken).toBeDefined();
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "otp-fp-valid" },
        data: { consumedAt: expect.any(Date) },
      });

      // Verify resetToken payload
      const decoded: any = jwt.verify(res.resetToken, config.auth.jwtSecret);
      expect(decoded.email).toBe("alice@codesphere.io");
      expect(decoded.otpId).toBe("otp-fp-valid");
      expect(decoded.purpose).toBe("RESET_PASSWORD_VERIFIED");
    });
  });

  describe("4. Password Reset & Legacy Account Upgrade", () => {
    it("rejects reset with invalid or expired resetToken", async () => {
      await expect(
        resetPassword({ resetToken: "", password: "NewPassword123!" })
      ).rejects.toThrow("Missing or invalid password reset token.");

      const expiredToken = jwt.sign(
        { email: "alice@codesphere.io", otpId: "otp-1", purpose: "RESET_PASSWORD_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "-1s" }
      );

      await expect(
        resetPassword({ resetToken: expiredToken, password: "NewPassword123!" })
      ).rejects.toThrow("Password reset session expired. Please verify your email again.");
    });

    it("rejects password shorter than 8 characters", async () => {
      const validToken = jwt.sign(
        { email: "alice@codesphere.io", otpId: "otp-1", purpose: "RESET_PASSWORD_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "15m" }
      );

      await expect(
        resetPassword({ resetToken: validToken, password: "short" })
      ).rejects.toThrow("Password must be at least 8 characters long.");
    });

    it("prevents token replay attacks (cannot reuse the same resetToken)", async () => {
      const validToken = jwt.sign(
        { email: "alice@codesphere.io", otpId: "otp-used-already", purpose: "RESET_PASSWORD_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "15m" }
      );

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-123",
        email: "alice@codesphere.io",
      } as any);

      // otpRecord already bound to a userId
      vi.spyOn(db.emailOtp, "findUnique").mockResolvedValue({
        id: "otp-used-already",
        userId: "user-123",
      } as any);

      await expect(
        resetPassword({ resetToken: validToken, password: "BrandNewPassword123!" })
      ).rejects.toThrow("This verification session has already been used to update a password.");
    });

    it("updates password hash and binds OTP permanently to prevent replay", async () => {
      const validToken = jwt.sign(
        { email: "legacy@codesphere.io", otpId: "otp-fp-fresh", purpose: "RESET_PASSWORD_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "15m" }
      );

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "legacy-user-456",
        email: "legacy@codesphere.io",
        passwordHash: null, // Legacy OTP-only user
      } as any);

      vi.spyOn(db.emailOtp, "findUnique").mockResolvedValue({
        id: "otp-fp-fresh",
        userId: null,
      } as any);

      const updateUserSpy = vi.spyOn(db.user, "update").mockResolvedValue({} as any);
      const updateOtpSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      const res = await resetPassword({
        resetToken: validToken,
        password: "BrandNewPassword123!",
      });

      expect(res.success).toBe(true);

      // Verify that user was updated with bcrypt hash
      const userUpdateArgs = updateUserSpy.mock.calls[0][0];
      expect(userUpdateArgs.where.id).toBe("legacy-user-456");
      expect(userUpdateArgs.data.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);

      // Verify bcrypt password matching
      expect(
        await verifyPassword("BrandNewPassword123!", userUpdateArgs.data.passwordHash as string)
      ).toBe(true);

      // Verify OTP bound to user
      expect(updateOtpSpy).toHaveBeenCalledWith({
        where: { id: "otp-fp-fresh" },
        data: { userId: "legacy-user-456" },
      });
    });
  });

  describe("5. Controller Endpoints & Session Management", () => {
    it("POST /api/auth/login sets HTTP-only secure cookie and returns user", async () => {
      const req: any = { body: { email: "alice@codesphere.io", password: "Password123!" } };
      const res = mockRes();

      const user = {
        id: "user-1",
        email: "alice@codesphere.io",
        name: "Alice",
        createdAt: new Date(),
      };

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        ...user,
        passwordHash: await hashPassword("Password123!"),
      } as any);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.cookie).toHaveBeenCalledWith(
        config.auth.cookieName,
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          path: "/",
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({ email: "alice@codesphere.io" }),
        })
      );
    });

    it("POST /api/auth/forgot-password/reset clears existing session cookie and rejects mismatched passwords", async () => {
      const mismatchReq: any = {
        body: {
          resetToken: "token123",
          password: "Password123!",
          confirmPassword: "MismatchPassword123!",
        },
      };
      const mismatchRes = mockRes();

      await forgotPasswordReset(mismatchReq, mismatchRes);
      expect(mismatchRes.status).toHaveBeenCalledWith(400);
      expect(mismatchRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "PASSWORD_MISMATCH" })
      );

      // Successful reset clears cookie
      const validToken = jwt.sign(
        { email: "alice@codesphere.io", otpId: "otp-reset-cookie", purpose: "RESET_PASSWORD_VERIFIED" },
        config.auth.jwtSecret
      );
      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "u-1",
        email: "alice@codesphere.io",
      } as any);
      vi.spyOn(db.emailOtp, "findUnique").mockResolvedValue({
        id: "otp-reset-cookie",
        userId: null,
      } as any);
      vi.spyOn(db.user, "update").mockResolvedValue({} as any);
      vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      const successReq: any = {
        body: {
          resetToken: validToken,
          password: "NewPassword123!",
          confirmPassword: "NewPassword123!",
        },
      };
      const successRes = mockRes();

      await forgotPasswordReset(successReq, successRes);
      expect(successRes.status).toHaveBeenCalledWith(200);
      expect(successRes.clearCookie).toHaveBeenCalledWith(
        config.auth.cookieName,
        expect.objectContaining({ httpOnly: true, path: "/" })
      );
    });

    it("POST /api/auth/logout clears session cookie", async () => {
      const req: any = {};
      const res = mockRes();

      await logout(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.clearCookie).toHaveBeenCalledWith(
        config.auth.cookieName,
        expect.objectContaining({ httpOnly: true, path: "/" })
      );
    });
  });
});

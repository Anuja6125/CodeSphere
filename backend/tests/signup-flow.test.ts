import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestSignupOtp,
  verifySignupOtp,
  completeSignup,
  hashPassword,
  verifyPassword,
  hashOtp,
  AuthError,
} from "../src/services/auth";
import { db } from "../src/lib/db";
import { config } from "../src/config/env";
import jwt from "jsonwebtoken";

describe("New Signup Flow (OTP Verification & Password Setup) Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Input Validation & Duplicate Accounts Prevention", () => {
    it("rejects invalid name (empty or < 2 characters)", async () => {
      await expect(requestSignupOtp({ name: "", email: "user@example.com" })).rejects.toThrow(
        "Please provide your full name (at least 2 characters)."
      );
      await expect(requestSignupOtp({ name: "A", email: "user@example.com" })).rejects.toThrow(
        "Please provide your full name (at least 2 characters)."
      );
    });

    it("rejects invalid email format", async () => {
      await expect(requestSignupOtp({ name: "Jane Doe", email: "invalid-email" })).rejects.toThrow(
        "Please provide a valid email address."
      );
    });

    it("prevents duplicate account creation if email already exists", async () => {
      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "existing-user-1",
        email: "existing@codesphere.io",
      } as any);

      await expect(
        requestSignupOtp({ name: "Jane Doe", email: "existing@codesphere.io" })
      ).rejects.toThrow("An account with this email already exists. Please sign in.");
    });
  });

  describe("2. Signup OTP Generation, Resend Behaviour & Rate Limiting", () => {
    it("enforces 60-second cooldown between signup OTP requests", async () => {
      const now = new Date();
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([
        {
          id: "otp-1",
          email: "jane@codesphere.io",
          otpHash: "hash123",
          purpose: "SIGNUP" as any,
          expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
          consumedAt: null,
          attempts: 0,
          createdAt: new Date(now.getTime() - 25 * 1000), // 25s ago
          userId: null,
        },
      ]);

      await expect(
        requestSignupOtp({ name: "Jane Doe", email: "jane@codesphere.io" })
      ).rejects.toThrow(/Please wait \d+ second\(s\) before requesting a new code/);
    });

    it("enforces window rate limit (max 5 OTPs per 15 min)", async () => {
      const now = new Date();
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      const mockRecent = Array.from({ length: 5 }, (_, i) => ({
        id: `otp-${i}`,
        email: "jane@codesphere.io",
        otpHash: `hash-${i}`,
        purpose: "SIGNUP" as any,
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(now.getTime() - (i + 2) * 60 * 1000), // > 60s ago
        userId: null,
      }));

      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue(mockRecent);

      await expect(
        requestSignupOtp({ name: "Jane Doe", email: "jane@codesphere.io" })
      ).rejects.toThrow("Too many OTP requests for this email. Please try again in 15 minutes.");
    });

    it("generates 6-digit code, stores hash with purpose SIGNUP, and invalidates previous active OTPs", async () => {
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([]);
      const updateManySpy = vi.spyOn(db.emailOtp, "updateMany").mockResolvedValue({ count: 1 });
      const createSpy = vi.spyOn(db.emailOtp, "create").mockResolvedValue({} as any);

      const res = await requestSignupOtp({ name: "Jane Doe", email: "jane@codesphere.io" });
      expect(res.success).toBe(true);
      expect(res.cooldownSeconds).toBe(60);

      // Verify that prior active signup OTPs were invalidated
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: "jane@codesphere.io", purpose: "SIGNUP" }),
        })
      );

      // Verify stored OTP record attributes
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "jane@codesphere.io",
            purpose: "SIGNUP",
            attempts: 0,
          }),
        })
      );
    });
  });

  describe("3. Signup OTP Verification & Session Binding", () => {
    it("rejects invalid OTP format (e.g. not 6 digits)", async () => {
      await expect(verifySignupOtp({ email: "jane@codesphere.io", code: "123" })).rejects.toThrow(
        "Please provide a valid 6-digit verification code."
      );
      await expect(verifySignupOtp({ email: "jane@codesphere.io", code: "abcdef" })).rejects.toThrow(
        "Please provide a valid 6-digit verification code."
      );
    });

    it("rejects when no active signup OTP is found", async () => {
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue(null);

      await expect(
        verifySignupOtp({ email: "jane@codesphere.io", code: "123456" })
      ).rejects.toThrow("No verification code found for this email. Please request a new code.");
    });

    it("rejects already consumed OTP", async () => {
      const now = new Date();
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-consumed",
        email: "jane@codesphere.io",
        otpHash: hashOtp("123456"),
        purpose: "SIGNUP" as any,
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
        consumedAt: new Date(now.getTime() - 1000), // already consumed
        attempts: 0,
        createdAt: new Date(now.getTime() - 60 * 1000),
        userId: null,
      });

      await expect(
        verifySignupOtp({ email: "jane@codesphere.io", code: "123456" })
      ).rejects.toThrow("This verification code has already been used. Please request a new code.");
    });

    it("rejects expired OTP (> 5 minutes)", async () => {
      const now = new Date();
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-exp",
        email: "jane@codesphere.io",
        otpHash: hashOtp("123456"),
        purpose: "SIGNUP" as any,
        expiresAt: new Date(now.getTime() - 5000), // expired 5 seconds ago
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(now.getTime() - 6 * 60 * 1000),
        userId: null,
      });

      await expect(
        verifySignupOtp({ email: "jane@codesphere.io", code: "123456" })
      ).rejects.toThrow("This verification code has expired. Please request a new one.");
    });

    it("increments attempts on invalid code and permanently invalidates after 5 failed attempts", async () => {
      const now = new Date();
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      const updateSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      // Attempt 3 of 5
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-attempts",
        email: "jane@codesphere.io",
        otpHash: hashOtp("999999"),
        purpose: "SIGNUP" as any,
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
        consumedAt: null,
        attempts: 2,
        createdAt: new Date(now.getTime() - 30 * 1000),
        userId: null,
      });

      await expect(
        verifySignupOtp({ email: "jane@codesphere.io", code: "123456" })
      ).rejects.toThrow("Invalid verification code. 2 attempt(s) remaining.");
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "otp-attempts" },
        data: { attempts: 3, consumedAt: null },
      });

      // 5th attempt failure
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-attempts",
        email: "jane@codesphere.io",
        otpHash: hashOtp("999999"),
        purpose: "SIGNUP" as any,
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
        consumedAt: null,
        attempts: 4,
        createdAt: new Date(now.getTime() - 30 * 1000),
        userId: null,
      });

      await expect(
        verifySignupOtp({ email: "jane@codesphere.io", code: "123456" })
      ).rejects.toThrow("Too many incorrect attempts. This code is now invalid. Please request a new code.");
    });

    it("verifies valid OTP, marks OTP consumed, and returns cryptographically signed signupToken", async () => {
      const now = new Date();
      const code = "654321";
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-valid-123",
        email: "jane@codesphere.io",
        otpHash: hashOtp(code),
        purpose: "SIGNUP" as any,
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(now.getTime() - 20 * 1000),
        userId: null,
      });
      const updateSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      const res = await verifySignupOtp({ email: "jane@codesphere.io", code, name: "Jane Doe" });
      expect(res.success).toBe(true);
      expect(res.signupToken).toBeDefined();

      // Check OTP marked consumed
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "otp-valid-123" },
        data: { consumedAt: expect.any(Date) },
      });

      // Verify signupToken payload
      const decoded: any = jwt.verify(res.signupToken, config.auth.jwtSecret);
      expect(decoded.email).toBe("jane@codesphere.io");
      expect(decoded.name).toBe("Jane Doe");
      expect(decoded.otpId).toBe("otp-valid-123");
      expect(decoded.purpose).toBe("SIGNUP_VERIFIED");
    });
  });

  describe("4. Password Setup, Account Creation & Direct API Bypass Prevention", () => {
    it("rejects direct account creation with missing or invalid signupToken", async () => {
      await expect(
        completeSignup({ signupToken: "", password: "Password123!" })
      ).rejects.toThrow("Missing or invalid signup verification token.");

      await expect(
        completeSignup({ signupToken: "invalid-token", password: "Password123!" })
      ).rejects.toThrow("Invalid signup verification token. Please verify your email again.");
    });

    it("rejects expired signupToken (interrupted signup)", async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { email: "jane@codesphere.io", otpId: "otp-1", purpose: "SIGNUP_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "-1s" }
      );

      await expect(
        completeSignup({ signupToken: expiredToken, password: "Password123!" })
      ).rejects.toThrow("Signup verification session expired. Please verify your email again.");
    });

    it("rejects passwords shorter than 8 characters", async () => {
      const validToken = jwt.sign(
        { email: "jane@codesphere.io", otpId: "otp-1", purpose: "SIGNUP_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "15m" }
      );

      await expect(
        completeSignup({ signupToken: validToken, password: "short" })
      ).rejects.toThrow("Password must be at least 8 characters long.");
    });

    it("prevents verification reuse (cannot create account twice with same OTP)", async () => {
      const validToken = jwt.sign(
        { email: "jane@codesphere.io", otpId: "otp-reused", purpose: "SIGNUP_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "15m" }
      );

      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      // OTP record already bound to a userId
      vi.spyOn(db.emailOtp, "findUnique").mockResolvedValue({
        id: "otp-reused",
        userId: "already-created-user-id",
      } as any);

      await expect(
        completeSignup({ signupToken: validToken, password: "SecurePassword123!" })
      ).rejects.toThrow("This verification code has already been used to create an account.");
    });

    it("securely creates user account with bcrypt password hash and binds OTP to user", async () => {
      const validToken = jwt.sign(
        { email: "jane@codesphere.io", name: "Jane Doe", otpId: "otp-clean", purpose: "SIGNUP_VERIFIED" },
        config.auth.jwtSecret,
        { expiresIn: "15m" }
      );

      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.emailOtp, "findUnique").mockResolvedValue({
        id: "otp-clean",
        userId: null,
      } as any);

      const createUserSpy = vi.spyOn(db.user, "create").mockResolvedValue({
        id: "new-user-uuid",
        email: "jane@codesphere.io",
        name: "Jane Doe",
        role: "EMPLOYEE",
      } as any);

      const updateOtpSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      const res = await completeSignup({
        signupToken: validToken,
        password: "MySecretPassword123!",
      });

      expect(res.success).toBe(true);
      expect(res.user.email).toBe("jane@codesphere.io");
      expect(res.user.name).toBe("Jane Doe");

      // Verify that the password was hashed with bcrypt (never plain text)
      const userCreateArgs = createUserSpy.mock.calls[0][0];
      expect(userCreateArgs.data.passwordHash).toBeDefined();
      expect(userCreateArgs.data.passwordHash).not.toBe("MySecretPassword123!");
      expect(userCreateArgs.data.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash signature

      // Verify that bcrypt can verify the password
      const passwordMatches = await verifyPassword("MySecretPassword123!", userCreateArgs.data.passwordHash!);
      expect(passwordMatches).toBe(true);

      const wrongPasswordMatches = await verifyPassword("WrongPassword123!", userCreateArgs.data.passwordHash!);
      expect(wrongPasswordMatches).toBe(false);

      // Verify OTP is permanently marked with created user id
      expect(updateOtpSpy).toHaveBeenCalledWith({
        where: { id: "otp-clean" },
        data: { userId: "new-user-uuid" },
      });
    });

    it("verifies hashPassword and verifyPassword utility functions work securely", async () => {
      const hash = await hashPassword("ComplexP@ssw0rd!2026");
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(await verifyPassword("ComplexP@ssw0rd!2026", hash)).toBe(true);
      expect(await verifyPassword("WrongP@ssw0rd!2026", hash)).toBe(false);
    });
  });
});

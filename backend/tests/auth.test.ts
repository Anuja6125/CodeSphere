import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateOtpCode, hashOtp, verifyToken, AuthError, requestOtp, verifyOtp } from "../src/services/auth";
import { requireAuth, AuthenticatedRequest } from "../src/middleware/auth";
import { db } from "../src/lib/db";
import { config } from "../src/config/env";
import jwt from "jsonwebtoken";

describe("Email OTP Authentication Unit & Integration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. OTP Generation and Hashing", () => {
    it("generates a 6-digit numeric OTP code", () => {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    });

    it("generates consistent HMAC-SHA256 hashes for the same code", () => {
      const hash1 = hashOtp("123456");
      const hash2 = hashOtp("123456");
      const hash3 = hashOtp("654321");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });
  });

  describe("2. Request OTP & Rate Limiting", () => {
    it("rejects invalid email formats", async () => {
      await expect(requestOtp("invalid-email")).rejects.toThrow(AuthError);
      await expect(requestOtp("invalid@")).rejects.toThrow("Please provide a valid email address.");
    });

    it("enforces 60-second cooldown between OTP requests", async () => {
      const now = new Date();
      // Mock db finding a recent OTP created 30 seconds ago
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([
        {
          id: "otp-1",
          email: "test@example.com",
          otpHash: "hash123",
          expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
          consumedAt: null,
          attempts: 0,
          createdAt: new Date(now.getTime() - 30 * 1000), // 30s ago
          userId: null,
        },
      ]);

      await expect(requestOtp("test@example.com")).rejects.toThrow(
        /Please wait \d+ second\(s\) before requesting a new code/
      );
    });

    it("enforces max requests window rate limit (5 per 15 min)", async () => {
      const now = new Date();
      // Mock 5 recent OTPs in the window
      const mockRecent = Array.from({ length: 5 }, (_, i) => ({
        id: `otp-${i}`,
        email: "spam@example.com",
        otpHash: `hash-${i}`,
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(now.getTime() - (i + 2) * 60 * 1000), // all > 60s ago
        userId: null,
      }));

      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue(mockRecent);

      await expect(requestOtp("spam@example.com")).rejects.toThrow(
        "Too many OTP requests for this email. Please try again in 15 minutes."
      );
    });

    it("successfully creates OTP record and sends email when valid", async () => {
      vi.spyOn(db.emailOtp, "findMany").mockResolvedValue([]);
      vi.spyOn(db.emailOtp, "updateMany").mockResolvedValue({ count: 0 });
      const createSpy = vi.spyOn(db.emailOtp, "create").mockResolvedValue({} as any);

      const result = await requestOtp("developer@codesphere.io");
      expect(result.success).toBe(true);
      expect(result.cooldownSeconds).toBe(60);
      expect(createSpy).toHaveBeenCalled();

      // Ensure stored data has hash and 5-min expiration, not raw OTP
      const createArgs = createSpy.mock.calls[0][0];
      expect(createArgs.data.email).toBe("developer@codesphere.io");
      expect(createArgs.data.otpHash).toHaveLength(64);
      expect(createArgs.data.attempts).toBe(0);
    });
  });

  describe("3. OTP Verification & Single-Use Enforcement", () => {
    it("rejects invalid code length or format", async () => {
      await expect(verifyOtp("test@example.com", "123")).rejects.toThrow(
        "Please provide a valid 6-digit verification code."
      );
      await expect(verifyOtp("test@example.com", "abcdef")).rejects.toThrow(
        "Please provide a valid 6-digit verification code."
      );
    });

    it("rejects when no active OTP is found", async () => {
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue(null);

      await expect(verifyOtp("unknown@example.com", "123456")).rejects.toThrow(
        "No verification code found for this email. Please request a new code."
      );
    });

    it("rejects already consumed OTP (single-use constraint)", async () => {
      const now = new Date();
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-used",
        email: "test@example.com",
        otpHash: hashOtp("123456"),
        expiresAt: new Date(now.getTime() + 3 * 60 * 1000),
        consumedAt: new Date(now.getTime() - 1000), // already consumed
        attempts: 0,
        createdAt: new Date(now.getTime() - 60 * 1000),
        userId: "user-1",
      });

      await expect(verifyOtp("test@example.com", "123456")).rejects.toThrow(
        "This verification code has already been used. Please request a new code."
      );
    });

    it("rejects expired OTP (> 5 minutes old)", async () => {
      const now = new Date();
      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-expired",
        email: "test@example.com",
        otpHash: hashOtp("123456"),
        expiresAt: new Date(now.getTime() - 10 * 1000), // expired 10 seconds ago
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(now.getTime() - 6 * 60 * 1000),
        userId: null,
      });

      await expect(verifyOtp("test@example.com", "123456")).rejects.toThrow(
        "This verification code has expired. Please request a new one."
      );
    });

    it("increments attempts and warns when incorrect OTP is provided", async () => {
      const now = new Date();
      const updateSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-active",
        email: "test@example.com",
        otpHash: hashOtp("999999"),
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        consumedAt: null,
        attempts: 2,
        createdAt: new Date(now.getTime() - 30 * 1000),
        userId: null,
      });

      await expect(verifyOtp("test@example.com", "123456")).rejects.toThrow(
        "Invalid verification code. 2 attempt(s) remaining."
      );

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "otp-active" },
        data: { attempts: 3, consumedAt: null },
      });
    });

    it("invalidates code when max attempts (5) are reached", async () => {
      const now = new Date();
      const updateSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-active",
        email: "test@example.com",
        otpHash: hashOtp("999999"),
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        consumedAt: null,
        attempts: 4, // 5th attempt will fail
        createdAt: new Date(now.getTime() - 30 * 1000),
        userId: null,
      });

      await expect(verifyOtp("test@example.com", "123456")).rejects.toThrow(
        "Too many incorrect attempts. This code is now invalid. Please request a new code."
      );

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attempts: 5 }),
        })
      );
    });

    it("authenticates and creates user with safe default role 'EMPLOYEE'", async () => {
      const now = new Date();
      const correctCode = "654321";

      vi.spyOn(db.emailOtp, "findFirst").mockResolvedValue({
        id: "otp-valid",
        email: "newuser@codesphere.io",
        otpHash: hashOtp(correctCode),
        expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(now.getTime() - 30 * 1000),
        userId: null,
      });

      // User does not exist yet
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.user, "create").mockResolvedValue({
        id: "user-new-id",
        email: "newuser@codesphere.io",
        role: "EMPLOYEE",
        createdAt: now,
        updatedAt: now,
      } as any);

      const updateOtpSpy = vi.spyOn(db.emailOtp, "update").mockResolvedValue({} as any);

      const { user, token } = await verifyOtp("newuser@codesphere.io", correctCode);

      expect(user.email).toBe("newuser@codesphere.io");
      expect(user.role).toBe("EMPLOYEE");
      expect(token).toBeDefined();

      // Ensure OTP marked consumed
      expect(updateOtpSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "user-new-id" }),
        })
      );

      // Verify token payload
      const decoded = verifyToken(token);
      expect(decoded.sub).toBe("user-new-id");
      expect(decoded.email).toBe("newuser@codesphere.io");
      expect(decoded.role).toBe("EMPLOYEE");
    });
  });

  describe("4. Authentication Middleware", () => {
    it("returns 401 when no token is present in cookie or header", () => {
      const req: AuthenticatedRequest = {
        cookies: {},
        headers: {},
      } as any;

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication required. Please log in." })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("authenticates and attaches user when valid token is in cookie", () => {
      const validToken = jwt.sign(
        { sub: "usr-123", email: "auth@codesphere.io", role: "EMPLOYEE" },
        config.auth.jwtSecret
      );

      const req: AuthenticatedRequest = {
        cookies: { [config.auth.cookieName]: validToken },
        headers: {},
      } as any;

      const res: any = {};
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.sub).toBe("usr-123");
      expect(req.user?.email).toBe("auth@codesphere.io");
    });

    it("authenticates and attaches user when valid token is in Authorization Bearer header", () => {
      const validToken = jwt.sign(
        { sub: "usr-bearer", email: "bearer@codesphere.io", role: "EMPLOYEE" },
        config.auth.jwtSecret
      );

      const req: AuthenticatedRequest = {
        cookies: {},
        headers: { authorization: `Bearer ${validToken}` },
      } as any;

      const res: any = {};
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user?.sub).toBe("usr-bearer");
    });
  });
});

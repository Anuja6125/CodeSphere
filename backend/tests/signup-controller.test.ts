import { describe, it, expect, vi, beforeEach } from "vitest";
import { signupSendOtp, signupVerifyOtp, signupComplete } from "../src/controllers/auth";
import * as authService from "../src/services/auth";

describe("Signup Controllers Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe("signupSendOtp Controller", () => {
    it("returns 400 if name is missing or invalid", async () => {
      const req: any = { body: { email: "user@example.com" } };
      const res = mockRes();
      await signupSendOtp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INVALID_NAME" })
      );
    });

    it("returns 400 if email is missing or invalid", async () => {
      const req: any = { body: { name: "John Doe" } };
      const res = mockRes();
      await signupSendOtp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INVALID_EMAIL" })
      );
    });

    it("returns 200 on successful OTP request", async () => {
      const req: any = { body: { name: "John Doe", email: "john@example.com" } };
      const res = mockRes();
      vi.spyOn(authService, "requestSignupOtp").mockResolvedValue({
        success: true,
        message: "Code sent",
        cooldownSeconds: 60,
      });

      await signupSendOtp(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, cooldownSeconds: 60 })
      );
    });
  });

  describe("signupVerifyOtp Controller", () => {
    it("returns 400 if email or code is missing", async () => {
      const req: any = { body: { email: "user@example.com" } };
      const res = mockRes();
      await signupVerifyOtp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INVALID_INPUT" })
      );
    });

    it("returns 200 with signupToken on successful verification", async () => {
      const req: any = { body: { email: "user@example.com", code: "123456", name: "User" } };
      const res = mockRes();
      vi.spyOn(authService, "verifySignupOtp").mockResolvedValue({
        success: true,
        message: "Verified",
        signupToken: "mock.jwt.token",
        email: "user@example.com",
      });

      await signupVerifyOtp(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ signupToken: "mock.jwt.token" })
      );
    });
  });

  describe("signupComplete Controller", () => {
    it("returns 400 if signupToken is missing", async () => {
      const req: any = { body: { password: "Password123!" } };
      const res = mockRes();
      await signupComplete(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INVALID_SIGNUP_TOKEN" })
      );
    });

    it("returns 400 if password is less than 8 characters", async () => {
      const req: any = { body: { signupToken: "token123", password: "short" } };
      const res = mockRes();
      await signupComplete(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INVALID_PASSWORD" })
      );
    });

    it("returns 400 if confirmPassword does not match password", async () => {
      const req: any = {
        body: {
          signupToken: "token123",
          password: "Password123!",
          confirmPassword: "DifferentPassword123!",
        },
      };
      const res = mockRes();
      await signupComplete(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "PASSWORD_MISMATCH", error: "Passwords do not match." })
      );
    });

    it("returns 201 on successful account creation", async () => {
      const req: any = {
        body: {
          signupToken: "token123",
          password: "Password123!",
          confirmPassword: "Password123!",
          name: "John Doe",
        },
      };
      const res = mockRes();
      vi.spyOn(authService, "completeSignup").mockResolvedValue({
        success: true,
        message: "Account created successfully.",
        user: {
          id: "u-1",
          email: "john@example.com",
          name: "John Doe",
        },
      });

      await signupComplete(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, user: expect.objectContaining({ email: "john@example.com" }) })
      );
    });
  });
});

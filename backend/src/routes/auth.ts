import express, { Router } from "express";
import { asyncHandler as h } from "../http/asyncHandler";
import * as auth from "../controllers/auth";
import { requireAuth } from "../middleware/auth";

const router = Router();
const json = express.json({ limit: "100kb" });

// Email & Password + OTP routes
router.post("/login", json, h(auth.login));
router.post("/send-otp", json, h(auth.sendOtp));
router.post("/verify-otp", json, h(auth.verifyOtp));
router.post("/signup/send-otp", json, h(auth.signupSendOtp));
router.post("/signup/verify-otp", json, h(auth.signupVerifyOtp));
router.post("/signup/complete", json, h(auth.signupComplete));
router.post("/forgot-password/send-otp", json, h(auth.forgotPasswordSendOtp));
router.post("/forgot-password/verify-otp", json, h(auth.forgotPasswordVerifyOtp));
router.post("/forgot-password/reset", json, h(auth.forgotPasswordReset));

router.get("/me", requireAuth, h(auth.getMe));
router.post("/logout", h(auth.logout));


export default router;

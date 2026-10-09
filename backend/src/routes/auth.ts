import express, { Router } from "express";
import { asyncHandler as h } from "../http/asyncHandler";
import * as auth from "../controllers/auth";
import { requireAuth } from "../middleware/auth";

const router = Router();
const json = express.json({ limit: "100kb" });

router.post("/send-otp", json, h(auth.sendOtp));
router.post("/verify-otp", json, h(auth.verifyOtp));
router.get("/me", requireAuth, h(auth.getMe));
router.post("/logout", h(auth.logout));

export default router;

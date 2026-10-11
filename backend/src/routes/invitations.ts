import express, { Router } from "express";
import { asyncHandler as h } from "../http/asyncHandler";
import * as inv from "../controllers/invitation";

const router = Router();
const json = express.json({ limit: "1mb" });

// Get all pending invitations received by current user
router.get("/", h(inv.listMyInvitations));

// Accept or reject an invitation
router.post("/:id/accept", json, h(inv.acceptInvitation));
router.post("/:id/reject", json, h(inv.rejectInvitation));

export default router;

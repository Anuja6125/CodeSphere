import express, { Router } from "express";
import { asyncHandler as h } from "../http/asyncHandler";
import * as users from "../controllers/users";
import { requireAuth, requireRole } from "../middleware/auth";
import { UserRole } from "@prisma/client";

const router = Router();
const json = express.json({ limit: "50kb" });

// All /api/users routes require authentication and MANAGER role
router.use(requireAuth);
router.use(requireRole(UserRole.MANAGER));

router.get("/", h(users.listUsers));
router.get("/stats", h(users.getManagerStats));
router.patch("/:id/role", json, h(users.updateUserRole));

export default router;

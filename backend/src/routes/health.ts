import { Router } from "express";
import { db } from "../lib/db";
import { errorMessage } from "../services/errors";

const router = Router();

// GET /api/health — is the server up, and can it reach the database?
router.get("/", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "ok" });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      database: "unreachable",
      message: errorMessage(error),
    });
  }
});

export default router;

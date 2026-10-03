import { Router } from "express";
import { db } from "../lib/db";

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
      message: firstLine(error),
    });
  }
});

// Prisma errors often start with blank lines. Show the first real line.
function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Database error";
}

export default router;

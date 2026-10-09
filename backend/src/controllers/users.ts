import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { db } from "../lib/db";
import { UserRole } from "@prisma/client";

/**
 * GET /api/users
 * MANAGER ONLY: View list of users and basic account details.
 */
export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          repositories: true,
          projectAccess: true,
        },
      },
    },
  });

  res.status(200).json({ users });
}

/**
 * PATCH /api/users/:id/role
 * MANAGER ONLY: Assign or change employee roles.
 * Users must NEVER be able to assign or modify their own role through public APIs.
 */
export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  const targetUserId = req.params.id as string;
  const { role } = req.body || {};

  // Rule 2: Users must never be able to assign or modify their own role
  if (req.user?.sub === targetUserId) {
    res.status(403).json({
      error: "Forbidden: Users cannot assign or modify their own role.",
      code: "CANNOT_MODIFY_OWN_ROLE",
    });
    return;
  }

  // Validate allowed role
  if (!role || (role !== UserRole.MANAGER && role !== UserRole.EMPLOYEE)) {
    res.status(400).json({
      error: "Invalid role. Role must be either 'MANAGER' or 'EMPLOYEE'.",
      code: "INVALID_ROLE",
    });
    return;
  }

  const existing = await db.user.findUnique({
    where: { id: targetUserId },
  });

  if (!existing) {
    res.status(404).json({
      error: "User not found.",
      code: "USER_NOT_FOUND",
    });
    return;
  }

  const updated = await db.user.update({
    where: { id: targetUserId },
    data: { role },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(200).json({
    success: true,
    message: `Role for ${updated.email} updated to ${updated.role}.`,
    user: updated,
  });
}

/**
 * GET /api/users/stats
 * MANAGER ONLY: Get high-level team and repository stats for manager dashboard view.
 */
export async function getManagerStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  const [totalUsers, totalManagers, totalEmployees, totalProjects] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: UserRole.MANAGER } }),
    db.user.count({ where: { role: UserRole.EMPLOYEE } }),
    db.repository.count(),
  ]);

  res.status(200).json({
    stats: {
      totalUsers,
      totalManagers,
      totalEmployees,
      totalProjects,
    },
  });
}

import { Request, Response, NextFunction } from "express";
import { verifyToken, UserSessionPayload } from "../services/auth";
import { config } from "../config/env";
import { db } from "../lib/db";
import { UserRole } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user?: UserSessionPayload;
  project?: any;
  projectRole?: string;
}

/**
 * Express middleware to ensure the request comes from an authenticated user.
 * Checks both the HTTP-only cookie and the Authorization Bearer header.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const tokenFromCookie = req.cookies?.[config.auth.cookieName];
  let tokenFromHeader: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    tokenFromHeader = authHeader.substring(7).trim();
  }

  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    res.status(401).json({
      error: "Authentication required. Please log in.",
      code: "UNAUTHORIZED",
    });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error: any) {
    res.status(error.statusCode || 401).json({
      error: error.message || "Invalid or expired session. Please log in again.",
      code: error.code || "UNAUTHORIZED",
    });
  }
}

/**
 * Role-Based Access Control middleware.
 * Verifies that the authenticated user possesses one of the required roles (e.g. MANAGER).
 */
export function requireRole(allowedRoles: UserRole | UserRole[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required. Please log in.",
        code: "UNAUTHORIZED",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: Only ${roles.join(" or ")} users can access this resource.`,
        code: "FORBIDDEN",
      });
      return;
    }

    next();
  };
}

/**
 * Project-Level Authorization middleware.
 * Enforces project-level access rules for BOTH Employees and Managers.
 * Users can only access projects they own or projects explicitly shared with them.
 */
export function requireProjectAccess(minRole: "VIEWER" | "EDITOR" | "MANAGER" = "VIEWER") {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required. Please log in.",
        code: "UNAUTHORIZED",
      });
      return;
    }

    const projectId = req.params.id as string;
    if (!projectId) {
      next();
      return;
    }

    try {
      const repo = (await db.repository.findUnique({
        where: { id: projectId },
        include: { access: true },
      })) as any;

      if (!repo) {
        res.status(404).json({
          error: "Repository not found.",
          code: "NOT_FOUND",
        });
        return;
      }

      // Support ownerId and legacy userId
      const ownerId = repo.ownerId ?? repo.userId;

      // Legacy demo project without assigned owner: allow access for backwards compatibility
      if (!ownerId) {
        req.project = repo;
        req.projectRole = "OWNER";
        next();
        return;
      }

      // Project owner has full access
      if (ownerId === req.user.sub) {
        req.project = repo;
        req.projectRole = "OWNER";
        next();
        return;
      }

      // Check explicit project sharing (ProjectAccess)
      const userAccess = repo.access?.find((a: any) => a.userId === req.user?.sub);
      if (!userAccess) {
        res.status(403).json({
          error: "Forbidden: You do not have access to this project.",
          code: "FORBIDDEN",
        });
        return;
      }

      // Check role hierarchy: VIEWER (1) < EDITOR (2) < MANAGER (3) < OWNER (4)
      const roleWeights: Record<string, number> = { VIEWER: 1, EDITOR: 2, MANAGER: 3, OWNER: 4 };
      const userWeight = roleWeights[userAccess.role] || 0;
      const requiredWeight = roleWeights[minRole] || 1;

      if (userWeight < requiredWeight) {
        res.status(403).json({
          error: `Forbidden: This action requires at least ${minRole} permissions on this project.`,
          code: "FORBIDDEN",
        });
        return;
      }

      req.project = repo;
      req.projectRole = userAccess.role;
      next();
    } catch (err: any) {
      console.error("requireProjectAccess check error:", err);
      res.status(500).json({ error: "Authorization check failed." });
    }
  };
}

/**
 * Optional middleware: attaches user if token is present, but doesn't block if missing.
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const tokenFromCookie = req.cookies?.[config.auth.cookieName];
  let tokenFromHeader: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    tokenFromHeader = authHeader.substring(7).trim();
  }

  const token = tokenFromCookie || tokenFromHeader;
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Ignore error for optional auth
    }
  }
  next();
}

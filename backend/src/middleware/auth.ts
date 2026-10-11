import { Request, Response, NextFunction } from "express";
import { verifyToken, UserSessionPayload } from "../services/auth";
import { config } from "../config/env";
import { db } from "../lib/db";
export interface AuthenticatedRequest extends Request {
  user?: UserSessionPayload;
  project?: any;
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
 * Project-Level Access middleware.
 * Ensures the project exists and belongs to the authenticated user.
 */
export function requireProjectAccess(_roleIgnored?: string) {
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
        include: {
          invitations: {
            where: { status: "ACCEPTED" },
            select: { inviteeId: true, status: true },
          },
        },
      })) as any;

      if (!repo) {
        res.status(404).json({
          error: "Repository not found.",
          code: "NOT_FOUND",
        });
        return;
      }

      const ownerId = repo.ownerId ?? repo.userId;
      const isOwner = !ownerId || ownerId === req.user.sub;
      const isAcceptedCollaborator = repo.invitations?.some(
        (inv: any) => inv.inviteeId === req.user?.sub && (!inv.status || inv.status === "ACCEPTED")
      );

      // Unowned/legacy demo repo, owned by user, or user is an accepted collaborator
      if (isOwner || isAcceptedCollaborator) {
        req.project = repo;
        next();
        return;
      }

      res.status(403).json({
        error: "Forbidden: You do not have access to this project.",
        code: "FORBIDDEN",
      });
    } catch (err: any) {
      console.error("requireProjectAccess check error:", err);
      res.status(500).json({ error: "Authorization check failed." });
    }
  };
}

/**
 * Project Ownership middleware.
 * Ensures the project exists and the authenticated user is the owner.
 */
export function requireProjectOwner() {
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
      })) as any;

      if (!repo) {
        res.status(404).json({
          error: "Repository not found.",
          code: "NOT_FOUND",
        });
        return;
      }

      const ownerId = repo.ownerId ?? repo.userId;
      if (ownerId && ownerId !== req.user.sub) {
        res.status(403).json({
          error: "Forbidden: Only the project owner can perform this action.",
          code: "FORBIDDEN",
        });
        return;
      }

      // For legacy repos without ownerId, claim ownership now
      if (!repo.ownerId && req.user.sub) {
        await db.repository.update({
          where: { id: projectId },
          data: { ownerId: req.user.sub },
        }).catch(() => {});
        repo.ownerId = req.user.sub;
      }

      req.project = repo;
      next();
    } catch (err: any) {
      console.error("requireProjectOwner check error:", err);
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

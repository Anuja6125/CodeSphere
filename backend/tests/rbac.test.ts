import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireRole, requireProjectAccess, AuthenticatedRequest } from "../src/middleware/auth";
import { updateUserRole, listUsers } from "../src/controllers/users";
import { db } from "../src/lib/db";
import { UserRole } from "@prisma/client";

describe("Role-Based Access Control (RBAC) & Project-Level Authorization Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Centralized Authorization Middleware (requireRole)", () => {
    it("returns 401 UNAUTHORIZED if user is unauthenticated", () => {
      const req: AuthenticatedRequest = { user: undefined } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const middleware = requireRole(UserRole.MANAGER);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }));
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 FORBIDDEN if EMPLOYEE attempts to access MANAGER route", () => {
      const req: AuthenticatedRequest = {
        user: { sub: "emp-1", email: "emp@codesphere.io", role: UserRole.EMPLOYEE },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const middleware = requireRole(UserRole.MANAGER);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "FORBIDDEN", error: expect.stringContaining("Only MANAGER") })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("allows MANAGER to access MANAGER route", () => {
      const req: AuthenticatedRequest = {
        user: { sub: "mgr-1", email: "mgr@codesphere.io", role: UserRole.MANAGER },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const middleware = requireRole(UserRole.MANAGER);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("2. Self-Role Modification Prevention (Requirement 2)", () => {
    it("rejects attempt by user to assign or modify their own role (403)", async () => {
      const req: AuthenticatedRequest = {
        user: { sub: "user-123", email: "user@codesphere.io", role: UserRole.MANAGER },
        params: { id: "user-123" }, // Attempting to modify own role!
        body: { role: UserRole.MANAGER },
      } as any;

      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await updateUserRole(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: Users cannot assign or modify their own role.",
        code: "CANNOT_MODIFY_OWN_ROLE",
      });
    });

    it("allows MANAGER to modify ANOTHER user's role", async () => {
      const req: AuthenticatedRequest = {
        user: { sub: "mgr-1", email: "mgr@codesphere.io", role: UserRole.MANAGER },
        params: { id: "emp-2" }, // Modifying someone else
        body: { role: UserRole.MANAGER },
      } as any;

      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "emp-2",
        email: "emp2@codesphere.io",
        role: UserRole.EMPLOYEE,
      } as any);

      vi.spyOn(db.user, "update").mockResolvedValue({
        id: "emp-2",
        email: "emp2@codesphere.io",
        role: UserRole.MANAGER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await updateUserRole(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({ role: UserRole.MANAGER }),
        })
      );
    });
  });

  describe("3. Project-Level Authorization Rules (Requirements 4, 5, 6)", () => {
    it("allows the creator/owner to access their project", async () => {
      const req: AuthenticatedRequest = {
        user: { sub: "owner-1", email: "owner@codesphere.io", role: UserRole.EMPLOYEE },
        params: { id: "repo-100" },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-100",
        userId: "owner-1", // Match owner
        access: [],
      } as any);

      const middleware = requireProjectAccess("VIEWER");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.projectRole).toBe("OWNER");
    });

    it("denies access to an unauthorized employee (403)", async () => {
      const req: AuthenticatedRequest = {
        user: { sub: "other-emp", email: "other@codesphere.io", role: UserRole.EMPLOYEE },
        params: { id: "repo-100" },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-100",
        userId: "owner-1", // Owned by someone else
        access: [], // Not shared
      } as any);

      const middleware = requireProjectAccess("VIEWER");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Forbidden: You do not have access to this project." })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("denies access to a MANAGER unless project access is explicitly granted (Requirement 6)", async () => {
      // Rule 6: Do not assume that every manager can automatically access every organization's private data.
      const req: AuthenticatedRequest = {
        user: { sub: "manager-x", email: "manager@codesphere.io", role: UserRole.MANAGER },
        params: { id: "private-repo-999" },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "private-repo-999",
        userId: "different-owner", // Owned by someone else
        access: [], // Not shared with manager-x
      } as any);

      const middleware = requireProjectAccess("VIEWER");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Forbidden: You do not have access to this project." })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("allows access when project is explicitly shared with the user via ProjectAccess", async () => {
      const req: AuthenticatedRequest = {
        user: { sub: "colleague-1", email: "colleague@codesphere.io", role: UserRole.EMPLOYEE },
        params: { id: "repo-100" },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-100",
        userId: "owner-1",
        access: [{ userId: "colleague-1", role: "VIEWER" }],
      } as any);

      const middleware = requireProjectAccess("VIEWER");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.projectRole).toBe("VIEWER");
    });

    it("enforces permission level: VIEWER cannot perform EDITOR actions", async () => {
      const req: AuthenticatedRequest = {
        user: { sub: "viewer-1", email: "viewer@codesphere.io", role: UserRole.EMPLOYEE },
        params: { id: "repo-100" },
      } as any;
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-100",
        userId: "owner-1",
        access: [{ userId: "viewer-1", role: "VIEWER" }],
      } as any);

      // Request requires EDITOR permissions (e.g. re-analyze or generate docs)
      const middleware = requireProjectAccess("EDITOR");
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("requires at least EDITOR permissions") })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});

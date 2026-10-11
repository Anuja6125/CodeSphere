import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { requireProjectAccess, requireProjectOwner, AuthenticatedRequest } from "../src/middleware/auth";
import {
  inviteCollaborator,
  listProjectInvitations,
  cancelProjectInvitation,
  removeCollaborator,
  listMyInvitations,
  acceptInvitation,
  rejectInvitation,
} from "../src/controllers/invitation";
import type { Response, NextFunction } from "express";

describe("Project-Specific Invitations & 2-Member Cap Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe("1. Invite Collaborator Validations", () => {
    it("allows project owner to invite a registered user and creates PENDING invitation", async () => {
      const repoId = "repo-1";
      const ownerId = "owner-1";
      const inviteeId = "user-2";
      const inviteeEmail = "collaborator@example.com";

      const req: any = {
        params: { id: repoId },
        user: { sub: ownerId, email: "owner@example.com" },
        body: { email: inviteeEmail },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: repoId,
        ownerId,
        name: "test-repo",
      } as any);

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: inviteeId,
        email: inviteeEmail,
      } as any);

      vi.spyOn(db.projectInvitation, "findFirst")
        .mockResolvedValueOnce(null) // no accepted collaborator
        .mockResolvedValueOnce(null); // no pending invitation

      const mockCreatedInvite = {
        id: "invite-1",
        repositoryId: repoId,
        inviterId: ownerId,
        inviteeId,
        status: "PENDING",
        invitee: { id: inviteeId, email: inviteeEmail },
        inviter: { id: ownerId, email: "owner@example.com" },
      };

      vi.spyOn(db.projectInvitation, "create").mockResolvedValue(mockCreatedInvite as any);

      await inviteCollaborator(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          invitation: expect.objectContaining({
            status: "PENDING",
            inviteeId,
          }),
        })
      );
    });

    it("prevents self-invitations with 400 error", async () => {
      const repoId = "repo-1";
      const ownerId = "owner-1";
      const ownerEmail = "owner@example.com";

      const req: any = {
        params: { id: repoId },
        user: { sub: ownerId, email: ownerEmail },
        body: { email: ownerEmail },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: repoId,
        ownerId,
      } as any);

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: ownerId,
        email: ownerEmail,
      } as any);

      await expect(inviteCollaborator(req, res)).rejects.toThrow("You cannot invite yourself to your own project.");
    });

    it("prevents inviting unregistered users with 404 error", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "owner-1", email: "owner@example.com" },
        body: { email: "nonexistent@example.com" },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-1",
      } as any);

      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);

      await expect(inviteCollaborator(req, res)).rejects.toThrow("is not registered. They must sign up for an account before being invited.");
    });

    it("prevents non-owner from inviting collaborators with 403 error", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "random-user", email: "random@example.com" },
        body: { email: "someone@example.com" },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "real-owner",
      } as any);

      await expect(inviteCollaborator(req, res)).rejects.toThrow("Only the project owner can invite collaborators.");
    });

    it("enforces max limit of 2 users: rejects invitation if project already has an active collaborator", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "owner-1", email: "owner@example.com" },
        body: { email: "user3@example.com" },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-1",
      } as any);

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-3",
        email: "user3@example.com",
      } as any);

      // Already has accepted collaborator user-2
      vi.spyOn(db.projectInvitation, "findFirst").mockResolvedValue({
        id: "invite-accepted",
        inviteeId: "user-2",
        status: "ACCEPTED",
        invitee: { id: "user-2", email: "user2@example.com" },
      } as any);

      await expect(inviteCollaborator(req, res)).rejects.toThrow("Project has reached its maximum limit of 2 members");
    });

    it("prevents duplicate pending invitations on the same project", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "owner-1", email: "owner@example.com" },
        body: { email: "user2@example.com" },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-1",
      } as any);

      vi.spyOn(db.user, "findUnique").mockResolvedValue({
        id: "user-2",
        email: "user2@example.com",
      } as any);

      vi.spyOn(db.projectInvitation, "findFirst")
        .mockResolvedValueOnce(null) // no accepted collaborator
        .mockResolvedValueOnce({
          id: "existing-pending",
          inviteeId: "user-2",
          status: "PENDING",
          invitee: { id: "user-2", email: "user2@example.com" },
        } as any);

      await expect(inviteCollaborator(req, res)).rejects.toThrow("An invitation is already pending for 'user2@example.com'.");
    });
  });

  describe("2. Acceptance Workflow & Intended Invitee Verification", () => {
    it("ensures only the intended invitee can accept an invitation (blocks other users with 403)", async () => {
      const req: any = {
        params: { id: "invite-123" },
        user: { sub: "unauthorized-user" },
      };
      const res = mockRes();

      vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
        id: "invite-123",
        repositoryId: "repo-1",
        inviteeId: "intended-invitee",
        status: "PENDING",
      } as any);

      await expect(acceptInvitation(req, res)).rejects.toThrow("Only the intended invitee can accept this invitation.");
    });

    it("allows intended invitee to accept, updates status to ACCEPTED and grants project access", async () => {
      const req: any = {
        params: { id: "invite-123" },
        user: { sub: "intended-invitee" },
      };
      const res = mockRes();

      vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
        id: "invite-123",
        repositoryId: "repo-1",
        inviteeId: "intended-invitee",
        status: "PENDING",
      } as any);

      vi.spyOn(db.projectInvitation, "findFirst").mockResolvedValue(null); // capacity check
      const updateSpy = vi.spyOn(db.projectInvitation, "update").mockResolvedValue({
        id: "invite-123",
        status: "ACCEPTED",
      } as any);

      await acceptInvitation(req, res);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "invite-123" },
        data: { status: "ACCEPTED" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          repositoryId: "repo-1",
        })
      );
    });

    it("enforces intended invitee verification on rejection", async () => {
      const req: any = {
        params: { id: "invite-123" },
        user: { sub: "intended-invitee" },
      };
      const res = mockRes();

      vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
        id: "invite-123",
        repositoryId: "repo-1",
        inviteeId: "intended-invitee",
        status: "PENDING",
      } as any);

      const updateSpy = vi.spyOn(db.projectInvitation, "update").mockResolvedValue({
        id: "invite-123",
        status: "REJECTED",
      } as any);

      await rejectInvitation(req, res);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "invite-123" },
        data: { status: "REJECTED" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Invitation rejected.",
        })
      );
    });
  });

  describe("3. Project Access Middleware with Collaborator Integration", () => {
    it("grants project access to an ACCEPTED collaborator", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "collaborator-bob", email: "bob@example.com" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-alice",
        invitations: [
          { inviteeId: "collaborator-bob" }, // status: ACCEPTED was queried
        ],
      } as any);

      const middleware = requireProjectAccess();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.project).toBeDefined();
    });

    it("blocks a user whose invitation is still PENDING (access granted only AFTER acceptance)", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "pending-user", email: "pending@example.com" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-alice",
        invitations: [], // No ACCEPTED invitation for pending-user
      } as any);

      const middleware = requireProjectAccess();
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "FORBIDDEN",
          error: "Forbidden: You do not have access to this project.",
        })
      );
    });

    it("enforces requireProjectOwner: blocks accepted collaborator from owner-only actions", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "collaborator-bob" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-alice",
      } as any);

      const middleware = requireProjectOwner();
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Forbidden: Only the project owner can perform this action.",
        })
      );
    });
  });

  describe("4. Cancellation & Collaborator Removal", () => {
    it("allows owner to cancel pending invitation", async () => {
      const req: any = {
        params: { id: "repo-1", invitationId: "inv-1" },
        user: { sub: "owner-1" },
      };
      const res = mockRes();

      vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
        id: "inv-1",
        repositoryId: "repo-1",
        status: "PENDING",
        invitee: { email: "invited@example.com" },
        repository: { ownerId: "owner-1" },
      } as any);

      const deleteSpy = vi.spyOn(db.projectInvitation, "delete").mockResolvedValue({ id: "inv-1" } as any);

      await cancelProjectInvitation(req, res);

      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: "inv-1" } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: "Invitation canceled successfully." })
      );
    });

    it("allows owner to remove accepted collaborator", async () => {
      const req: any = {
        params: { id: "repo-1" },
        user: { sub: "owner-1" },
      };
      const res = mockRes();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "repo-1",
        ownerId: "owner-1",
      } as any);

      vi.spyOn(db.projectInvitation, "findFirst").mockResolvedValue({
        id: "inv-accepted-1",
        repositoryId: "repo-1",
        status: "ACCEPTED",
        inviteeId: "collab-1",
        invitee: { email: "collab@example.com" },
      } as any);

      const deleteSpy = vi.spyOn(db.projectInvitation, "delete").mockResolvedValue({ id: "inv-accepted-1" } as any);

      await removeCollaborator(req, res);

      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: "inv-accepted-1" } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: "Collaborator removed successfully." })
      );
    });
  });
});

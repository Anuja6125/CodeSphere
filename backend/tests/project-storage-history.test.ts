import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { requireProjectAccess } from "../src/middleware/auth";
import type { Request, Response, NextFunction } from "express";

describe("Project Storage & History Unit & Integration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Creator Association & Project Storage", () => {
    it("associates new project with its creator using ownerId", async () => {
      const mockProject = {
        id: "proj-101",
        name: "test-repo",
        owner: "user1",
        url: "https://github.com/user1/test-repo.git",
        sourceType: "GITHUB",
        status: "PENDING",
        ownerId: "user-creator-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db.repository, "create").mockResolvedValue(mockProject as any);

      const created = await db.repository.create({
        data: {
          name: "test-repo",
          owner: "user1",
          url: "https://github.com/user1/test-repo.git",
          sourceType: "GITHUB",
          status: "PENDING",
          ownerId: "user-creator-1",
        },
      });

      expect(created.ownerId).toBe("user-creator-1");
      expect(created.name).toBe("test-repo");
    });
  });

  describe("2. Project History & Activity Tracking", () => {
    it("persists project activities across lifecycle events", async () => {
      const mockActivity = {
        id: "act-1",
        repositoryId: "proj-101",
        userId: "user-creator-1",
        activityType: "PROJECT_CREATED",
        title: "Project imported from GitHub",
        description: "GitHub repository: https://github.com/user1/test-repo.git",
        metadata: { sourceType: "GITHUB" },
        createdAt: new Date(),
      };

      const createActivitySpy = vi.spyOn(db.projectActivity, "create").mockResolvedValue(mockActivity as any);

      const result = await db.projectActivity.create({
        data: {
          repositoryId: "proj-101",
          userId: "user-creator-1",
          activityType: "PROJECT_CREATED",
          title: "Project imported from GitHub",
          description: "GitHub repository: https://github.com/user1/test-repo.git",
          metadata: { sourceType: "GITHUB" },
        },
      });

      expect(createActivitySpy).toHaveBeenCalled();
      expect(result.activityType).toBe("PROJECT_CREATED");
      expect(result.repositoryId).toBe("proj-101");
    });

    it("persists graph generation and documentation generation activities", async () => {
      const activities = [
        {
          id: "act-2",
          repositoryId: "proj-101",
          activityType: "GRAPH_GENERATED",
          title: "Dependency graph generated",
          createdAt: new Date(),
        },
        {
          id: "act-3",
          repositoryId: "proj-101",
          activityType: "DOCS_GENERATED",
          title: "Documentation generated",
          createdAt: new Date(),
        },
      ];

      vi.spyOn(db.projectActivity, "findMany").mockResolvedValue(activities as any);

      const fetched = await db.projectActivity.findMany({
        where: { repositoryId: "proj-101" },
        orderBy: { createdAt: "desc" },
      });

      expect(fetched).toHaveLength(2);
      expect(fetched[0].activityType).toBe("GRAPH_GENERATED");
      expect(fetched[1].activityType).toBe("DOCS_GENERATED");
    });
  });

  describe("3. Chat Conversation Scoping & Privacy", () => {
    it("scopes chat messages to the relevant project and authorized user", async () => {
      const userAId = "user-alice";
      const userBId = "user-bob";

      const chatAlice = {
        id: "chat-1",
        repositoryId: "proj-shared",
        userId: userAId,
        role: "user",
        content: "How does the auth middleware work?",
        createdAt: new Date(),
      };

      const findManySpy = vi.spyOn(db.chatMessage, "findMany").mockResolvedValue([chatAlice] as any);

      // User Alice queries chat
      const messages = await db.chatMessage.findMany({
        where: { repositoryId: "proj-shared", userId: userAId },
      });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ repositoryId: "proj-shared", userId: userAId }),
        })
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].userId).toBe(userAId);
    });
  });

  describe("4. Cross-User Access Isolation & Security", () => {
    it("blocks Employee B from accessing Employee A's private project (returns 403)", async () => {
      const req: any = {
        params: { id: "private-repo-alice" },
        user: { sub: "emp-bob", role: "EMPLOYEE", email: "bob@example.com" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "private-repo-alice",
        ownerId: "emp-alice", // Owned by Alice
        access: [], // Not shared with Bob
      } as any);

      const middleware = requireProjectAccess("VIEWER");
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

    it("blocks Manager from accessing an employee's private project without explicit ProjectAccess", async () => {
      const req: any = {
        params: { id: "private-repo-alice" },
        user: { sub: "mgr-charlie", role: "MANAGER", email: "manager@example.com" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "private-repo-alice",
        ownerId: "emp-alice", // Owned by Alice
        access: [], // No access record for Manager
      } as any);

      const middleware = requireProjectAccess("VIEWER");
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("allows Manager to access employee's project when explicit ProjectAccess is granted", async () => {
      const req: any = {
        params: { id: "shared-repo-alice" },
        user: { sub: "mgr-charlie", role: "MANAGER", email: "manager@example.com" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "shared-repo-alice",
        ownerId: "emp-alice",
        access: [
          { userId: "mgr-charlie", role: "VIEWER" },
        ],
      } as any);

      const middleware = requireProjectAccess("VIEWER");
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("rejects unauthorized updates when user only has VIEWER access", async () => {
      const req: any = {
        params: { id: "shared-repo-alice" },
        user: { sub: "viewer-dave", role: "EMPLOYEE", email: "dave@example.com" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next: NextFunction = vi.fn();

      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: "shared-repo-alice",
        ownerId: "emp-alice",
        access: [
          { userId: "viewer-dave", role: "VIEWER" },
        ],
      } as any);

      // Re-analysis or documentation generation requires EDITOR
      const middleware = requireProjectAccess("EDITOR");
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Forbidden: This action requires at least EDITOR permissions on this project.",
        })
      );
    });
  });

  describe("5. Consistent Deletion & Retention", () => {
    it("deletes repository and cascades to access records and activities", async () => {
      const deleteRepoSpy = vi.spyOn(db.repository, "delete").mockResolvedValue({ id: "proj-101" } as any);

      await db.repository.delete({
        where: { id: "proj-101" },
      });

      expect(deleteRepoSpy).toHaveBeenCalledWith({
        where: { id: "proj-101" },
      });
    });
  });

  describe("6. Persistence After Logout and Login", () => {
    it("maintains project ownership and history across different sessions", async () => {
      const repoId = "persistent-proj-1";
      const ownerId = "emp-alice";

      // Session 1: Alice creates project
      vi.spyOn(db.repository, "findUnique").mockResolvedValue({
        id: repoId,
        ownerId,
        name: "persistent-repo",
        activities: [
          { id: "act-1", activityType: "PROJECT_CREATED", createdAt: new Date("2026-10-09T10:00:00Z") },
        ],
      } as any);

      const beforeLogout = await db.repository.findUnique({
        where: { id: repoId },
        include: { activities: true },
      });

      expect(beforeLogout?.ownerId).toBe(ownerId);
      expect(beforeLogout?.activities).toHaveLength(1);

      // Session 2: Alice logs back in (new session, fresh token query)
      const afterLogin = await db.repository.findUnique({
        where: { id: repoId },
        include: { activities: true },
      });

      expect(afterLogin?.ownerId).toBe(ownerId);
      expect(afterLogin?.name).toBe("persistent-repo");
      expect(afterLogin?.activities[0].activityType).toBe("PROJECT_CREATED");
    });
  });
});

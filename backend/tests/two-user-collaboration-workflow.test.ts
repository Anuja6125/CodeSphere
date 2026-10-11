import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { requireProjectAccess, requireProjectOwner } from "../src/middleware/auth";
import {
  inviteCollaborator,
  listProjectInvitations,
  cancelProjectInvitation,
  removeCollaborator,
  listMyInvitations,
  acceptInvitation,
  rejectInvitation,
} from "../src/controllers/invitation";
import { listRepositories, getRepository } from "../src/controllers/repository";

describe("Two-User Complete Collaboration Workflow Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db.projectActivity, "create").mockResolvedValue({} as any);
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const userA = {
    id: "user-a-owner-id",
    email: "alice.owner@codesphere.io",
    name: "Alice Owner",
  };

  const userB = {
    id: "user-b-collab-id",
    email: "bob.invitee@codesphere.io",
    name: "Bob Invitee",
  };

  const userC = {
    id: "user-c-third-id",
    email: "charlie.intruder@codesphere.io",
    name: "Charlie Third",
  };

  const project = {
    id: "project-phoenix-123",
    name: "Team Phoenix Codebase",
    owner: "local",
    ownerId: userA.id,
    sourceType: "ZIP",
    status: "INDEXED",
    totalFiles: 42,
    totalLines: 1200,
  };

  it("Full E2E collaboration lifecycle between User A and User B", async () => {
    // ---------------------------------------------------------
    // STEP 1: User A views their project and invites User B
    // ---------------------------------------------------------
    const inviteReq: any = {
      params: { id: project.id },
      user: { sub: userA.id, email: userA.email },
      body: { email: userB.email },
    };
    const inviteRes = mockRes();

    // Mock DB queries for invitation
    vi.spyOn(db.repository, "findUnique").mockResolvedValue(project as any);
    vi.spyOn(db.user, "findUnique").mockResolvedValue(userB as any);
    vi.spyOn(db.projectInvitation, "findFirst")
      .mockResolvedValueOnce(null) // no existing accepted collaborator
      .mockResolvedValueOnce(null); // no active pending invitation

    const createdInvitation = {
      id: "invitation-101",
      repositoryId: project.id,
      inviterId: userA.id,
      inviteeId: userB.id,
      status: "PENDING" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      inviter: { id: userA.id, email: userA.email },
      invitee: { id: userB.id, email: userB.email },
    };

    vi.spyOn(db.projectInvitation, "create").mockResolvedValue(createdInvitation as any);

    await inviteCollaborator(inviteReq, inviteRes);

    expect(inviteRes.status).toHaveBeenCalledWith(201);
    expect(inviteRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining(userB.email),
        invitation: expect.objectContaining({
          id: "invitation-101",
          status: "PENDING",
          inviteeId: userB.id,
        }),
      })
    );

    // ---------------------------------------------------------
    // STEP 2: User B views pending invitations on dashboard
    // ---------------------------------------------------------
    const myInvitesReq: any = {
      user: { sub: userB.id, email: userB.email },
    };
    const myInvitesRes = mockRes();

    vi.spyOn(db.projectInvitation, "findMany").mockResolvedValue([
      {
        ...createdInvitation,
        repository: { id: project.id, name: project.name, owner: project.owner },
      },
    ] as any);

    await listMyInvitations(myInvitesReq, myInvitesRes);

    expect(myInvitesRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        invitations: [
          expect.objectContaining({
            id: "invitation-101",
            status: "PENDING",
            repository: expect.objectContaining({ name: "Team Phoenix Codebase" }),
            inviter: expect.objectContaining({ email: "alice.owner@codesphere.io" }),
          }),
        ],
      })
    );

    // ---------------------------------------------------------
    // STEP 3: Prior to acceptance, User B cannot access the project
    // ---------------------------------------------------------
    const accessReqPrior: any = {
      params: { id: project.id },
      user: { sub: userB.id, email: userB.email },
    };
    const accessNextPrior = vi.fn();
    const accessResPrior = mockRes();

    // Mock DB findUnique: repo owned by User A, no accepted invitations yet
    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      ...project,
      ownerId: userA.id,
      invitations: [],
    } as any);

    await requireProjectAccess()(accessReqPrior, accessResPrior, accessNextPrior);

    expect(accessResPrior.status).toHaveBeenCalledWith(403);
    expect(accessNextPrior).not.toHaveBeenCalled();

    // ---------------------------------------------------------
    // STEP 4: User C attempts to accept User B's invitation -> 403 Forbidden
    // ---------------------------------------------------------
    const intruderReq: any = {
      params: { id: "invitation-101" },
      user: { sub: userC.id, email: userC.email },
    };
    const intruderRes = mockRes();

    vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
      ...createdInvitation,
      repository: project,
    } as any);

    await expect(acceptInvitation(intruderReq, intruderRes)).rejects.toThrow(
      "Forbidden: Only the intended invitee can accept this invitation."
    );

    // ---------------------------------------------------------
    // STEP 5: User B accepts the invitation -> Status becomes ACCEPTED
    // ---------------------------------------------------------
    const acceptReq: any = {
      params: { id: "invitation-101" },
      user: { sub: userB.id, email: userB.email },
    };
    const acceptRes = mockRes();

    vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
      ...createdInvitation,
      repository: project,
    } as any);

    vi.spyOn(db.projectInvitation, "count").mockResolvedValue(0); // no other accepted collaborator

    const acceptedInvite = {
      ...createdInvitation,
      status: "ACCEPTED" as const,
    };
    vi.spyOn(db.projectInvitation, "update").mockResolvedValue(acceptedInvite as any);

    await acceptInvitation(acceptReq, acceptRes);

    expect(acceptRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Invitation accepted successfully.",
        repositoryId: project.id,
      })
    );

    // ---------------------------------------------------------
    // STEP 6: User B now has full project access
    // ---------------------------------------------------------
    const accessReqPost: any = {
      params: { id: project.id },
      user: { sub: userB.id, email: userB.email },
    };
    const accessNextPost = vi.fn();
    const accessResPost = mockRes();

    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      ...project,
      ownerId: userA.id,
      invitations: [{ inviteeId: userB.id }],
    } as any);

    await requireProjectAccess()(accessReqPost, accessResPost, accessNextPost);

    expect(accessNextPost).toHaveBeenCalled();

    // ---------------------------------------------------------
    // STEP 7: User B lists projects -> Appears under Shared with User B
    // ---------------------------------------------------------
    const listReqUserB: any = {
      user: { sub: userB.id, email: userB.email },
    };
    const listResUserB = mockRes();

    vi.spyOn(db.repository, "findMany").mockResolvedValue([
      {
        ...project,
        ownerId: userA.id,
        ownerUser: userA,
        invitations: [
          {
            id: "invitation-101",
            status: "ACCEPTED",
            invitee: userB,
          },
        ],
      },
    ] as any);

    await listRepositories(listReqUserB, listResUserB);

    expect(listResUserB.json).toHaveBeenCalledWith({
      repositories: [
        expect.objectContaining({
          id: project.id,
          name: "Team Phoenix Codebase",
          userId: userA.id,
          user: expect.objectContaining({ email: userA.email }),
          collaborator: expect.objectContaining({ id: userB.id, email: userB.email }),
        }),
      ],
    });

    // ---------------------------------------------------------
    // STEP 8: Project capacity limit enforced (Max 2 members)
    // User A cannot invite User C because User B is already accepted
    // ---------------------------------------------------------
    const inviteThirdReq: any = {
      params: { id: project.id },
      user: { sub: userA.id, email: userA.email },
      body: { email: userC.email },
    };
    const inviteThirdRes = mockRes();

    vi.spyOn(db.repository, "findUnique").mockResolvedValue(project as any);
    vi.spyOn(db.user, "findUnique").mockResolvedValue(userC as any);
    vi.spyOn(db.projectInvitation, "findFirst").mockResolvedValueOnce({
      id: "invitation-101",
      status: "ACCEPTED",
    } as any); // project already has accepted collaborator

    await expect(inviteCollaborator(inviteThirdReq, inviteThirdRes)).rejects.toThrow(
      "Project has reached its maximum limit of 2 members"
    );

    // ---------------------------------------------------------
    // STEP 9: User B leaves project -> Collaborator record deleted
    // ---------------------------------------------------------
    const leaveReq: any = {
      params: { id: project.id },
      user: { sub: userB.id, email: userB.email },
    };
    const leaveRes = mockRes();

    vi.spyOn(db.repository, "findUnique").mockResolvedValue(project as any);
    vi.spyOn(db.projectInvitation, "findFirst").mockResolvedValue({
      id: "invitation-101",
      repositoryId: project.id,
      status: "ACCEPTED",
      inviteeId: userB.id,
    } as any);
    vi.spyOn(db.projectInvitation, "delete").mockResolvedValue({ id: "invitation-101" } as any);

    await removeCollaborator(leaveReq, leaveRes);

    expect(leaveRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Collaborator removed successfully.",
      })
    );
  });

  it("Invitation rejection workflow: invitee declines and access is withheld", async () => {
    const inviteReq: any = {
      params: { id: "inv-reject-1" },
      user: { sub: userB.id, email: userB.email },
    };
    const inviteRes = mockRes();

    vi.spyOn(db.projectInvitation, "findUnique").mockResolvedValue({
      id: "inv-reject-1",
      repositoryId: project.id,
      inviteeId: userB.id,
      status: "PENDING",
    } as any);

    const updateSpy = vi.spyOn(db.projectInvitation, "update").mockResolvedValue({
      id: "inv-reject-1",
      status: "REJECTED",
    } as any);

    await rejectInvitation(inviteReq, inviteRes);

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: "inv-reject-1" },
      data: { status: "REJECTED" },
    });
    expect(inviteRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Invitation rejected.",
      })
    );

    // Verify User B is still denied project access
    const accessReq: any = {
      params: { id: project.id },
      user: { sub: userB.id, email: userB.email },
    };
    const accessRes = mockRes();
    const accessNext = vi.fn();

    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      ...project,
      invitations: [{ inviteeId: userB.id, status: "REJECTED" }], // not ACCEPTED
    } as any);

    await requireProjectAccess()(accessReq, accessRes, accessNext);
    expect(accessRes.status).toHaveBeenCalledWith(403);
    expect(accessNext).not.toHaveBeenCalled();
  });

  it("Blocks non-members from accessing project APIs and prevents collaborator from deleting project", async () => {
    // 1. Non-member (User C) blocked from project access
    const nonMemberReq: any = {
      params: { id: project.id },
      user: { sub: userC.id, email: userC.email },
    };
    const nonMemberRes = mockRes();
    const nonMemberNext = vi.fn();

    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      ...project,
      ownerId: userA.id,
      invitations: [{ inviteeId: userB.id, status: "ACCEPTED" }],
    } as any);

    await requireProjectAccess()(nonMemberReq, nonMemberRes, nonMemberNext);
    expect(nonMemberRes.status).toHaveBeenCalledWith(403);
    expect(nonMemberNext).not.toHaveBeenCalled();

    // 2. Collaborator (User B) blocked from deleting project (owner-only action)
    const collabDeleteReq: any = {
      params: { id: project.id },
      user: { sub: userB.id, email: userB.email },
    };
    const collabDeleteRes = mockRes();
    const collabDeleteNext = vi.fn();

    await requireProjectOwner()(collabDeleteReq, collabDeleteRes, collabDeleteNext);
    expect(collabDeleteRes.status).toHaveBeenCalledWith(403);
    expect(collabDeleteNext).not.toHaveBeenCalled();

    // 3. Owner (User A) is permitted to delete project
    const ownerDeleteReq: any = {
      params: { id: project.id },
      user: { sub: userA.id, email: userA.email },
    };
    const ownerDeleteRes = mockRes();
    const ownerDeleteNext = vi.fn();

    await requireProjectOwner()(ownerDeleteReq, ownerDeleteRes, ownerDeleteNext);
    expect(ownerDeleteNext).toHaveBeenCalled();
  });

  it("Delivers latest saved project data and activities to both collaborators", async () => {
    const getReq: any = {
      params: { id: project.id },
      user: { sub: userB.id, email: userB.email },
    };
    const getRes = mockRes();

    const mockActivities = [
      {
        id: "act-1",
        activityType: "PROJECT_SHARED",
        title: "Invitation accepted",
        description: "Accepted invitation to collaborate on project.",
        createdAt: new Date(),
        user: { id: userB.id, email: userB.email },
      },
      {
        id: "act-0",
        activityType: "PROJECT_CREATED",
        title: "Project created",
        description: "Project imported from ZIP",
        createdAt: new Date(),
        user: { id: userA.id, email: userA.email },
      },
    ];

    vi.spyOn(db.repository, "findUnique").mockResolvedValue({
      ...project,
      ownerId: userA.id,
      ownerUser: userA,
      invitations: [{ id: "inv-1", status: "ACCEPTED", invitee: userB }],
      activities: mockActivities,
      _count: { chats: 3, chunks: 10, activities: 2 },
    } as any);

    vi.spyOn(db.codeChunk, "count").mockResolvedValue(10);

    await getRepository(getReq, getRes);

    expect(getRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: expect.objectContaining({
          id: project.id,
          user: expect.objectContaining({ email: userA.email }),
          collaborator: expect.objectContaining({ email: userB.email }),
          activities: expect.arrayContaining([
            expect.objectContaining({ title: "Invitation accepted" }),
            expect.objectContaining({ title: "Project created" }),
          ]),
        }),
      })
    );
  });
});

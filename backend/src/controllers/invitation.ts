import type { Request, Response } from "express";
import { idParam } from "../http/params";
import { db } from "../lib/db";
import { HttpError } from "../services/errors";
import { AuthenticatedRequest } from "../middleware/auth";
import { logActivity } from "../services/activity";

/**
 * POST /api/repositories/:id/invitations
 * Project owner invites another registered user by email address.
 * Constraints:
 * - Max 2 users per project (owner + 1 collaborator).
 * - Target user must be registered.
 * - No self-invitations.
 * - No duplicate memberships (already owner or accepted collaborator).
 * - No duplicate pending invitations.
 */
export async function inviteCollaborator(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const inviterId = (req as AuthenticatedRequest).user?.sub;

  if (!inviterId) {
    throw new HttpError(401, "Authentication required.");
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpError(400, "Please provide a valid user email address.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Fetch repository and verify ownership
  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
  });

  if (!repo) {
    throw new HttpError(404, "Repository not found.");
  }

  const ownerId = repo.ownerId ?? (repo as any).userId;
  if (ownerId && ownerId !== inviterId) {
    throw new HttpError(403, "Forbidden: Only the project owner can invite collaborators.");
  }

  // If repo has no ownerId (legacy repository), assign ownership to inviterId now
  if (!repo.ownerId) {
    await db.repository.update({
      where: { id: repositoryId },
      data: { ownerId: inviterId },
    }).catch(() => {});
  }

  // 2. Fetch target user
  const targetUser = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!targetUser) {
    throw new HttpError(404, `User '${normalizedEmail}' is not registered. They must sign up for an account before being invited.`);
  }

  // 3. Prevent self-invitation
  if (targetUser.id === inviterId || (ownerId && targetUser.id === ownerId)) {
    throw new HttpError(400, "You cannot invite yourself to your own project.");
  }

  // 4. Check active membership capacity (Max 2 users: 1 owner + 1 collaborator)
  const acceptedInvitation = await db.projectInvitation.findFirst({
    where: {
      repositoryId,
      status: "ACCEPTED",
    },
    include: {
      invitee: { select: { id: true, email: true } },
    },
  });

  if (acceptedInvitation) {
    if (acceptedInvitation.inviteeId === targetUser.id) {
      throw new HttpError(400, `User '${normalizedEmail}' is already an active collaborator on this project.`);
    }
    throw new HttpError(400, "Project has reached its maximum limit of 2 members (Owner + 1 Collaborator). Remove the existing collaborator before inviting someone new.");
  }

  // 5. Check if an invitation is already pending for this project
  const pendingInvitation = await db.projectInvitation.findFirst({
    where: {
      repositoryId,
      status: "PENDING",
    },
    include: {
      invitee: { select: { id: true, email: true } },
    },
  });

  if (pendingInvitation) {
    if (pendingInvitation.inviteeId === targetUser.id) {
      throw new HttpError(400, `An invitation is already pending for '${normalizedEmail}'.`);
    }
    throw new HttpError(400, `A pending invitation already exists for '${pendingInvitation.invitee.email}'. Cancel it first before inviting another user.`);
  }

  // 6. Create the invitation with status PENDING
  const invitation = await db.projectInvitation.create({
    data: {
      repositoryId,
      inviterId,
      inviteeId: targetUser.id,
      status: "PENDING",
    },
    include: {
      invitee: { select: { id: true, email: true } },
      inviter: { select: { id: true, email: true } },
    },
  });

  void logActivity({
    repositoryId,
    userId: inviterId,
    activityType: "PROJECT_SHARED",
    title: `Invitation sent to ${targetUser.email}`,
    description: `Invited ${targetUser.email} to collaborate on the project.`,
    metadata: { inviteeId: targetUser.id, inviteeEmail: targetUser.email },
  });

  res.status(201).json({
    success: true,
    message: `Invitation sent to ${targetUser.email}.`,
    invitation,
  });
}

/**
 * GET /api/repositories/:id/invitations
 * List all invitations for a project.
 */
export async function listProjectInvitations(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const userId = (req as AuthenticatedRequest).user?.sub;

  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    include: {
      ownerUser: { select: { id: true, email: true } },
    },
  });

  if (!repo) {
    throw new HttpError(404, "Repository not found.");
  }

  let owner = repo.ownerUser;

  // Auto-claim legacy projects where ownerId was null
  if (!owner && !repo.ownerId && userId) {
    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (currentUser) {
      await db.repository.update({
        where: { id: repositoryId },
        data: { ownerId: userId },
      }).catch(() => {});
      owner = currentUser;
    }
  }

  const invitations = await db.projectInvitation.findMany({
    where: { repositoryId },
    orderBy: { createdAt: "desc" },
    include: {
      inviter: { select: { id: true, email: true } },
      invitee: { select: { id: true, email: true } },
    },
  });

  const accepted = invitations.find((i) => i.status === "ACCEPTED") ?? null;
  const pending = invitations.find((i) => i.status === "PENDING") ?? null;

  res.json({
    repositoryId,
    owner: owner ?? (userId ? { id: userId, email: (req as AuthenticatedRequest).user?.email || "Project Owner" } : { id: "unknown", email: "Project Owner" }),
    collaborator: accepted?.invitee ?? null,
    pendingInvitation: pending ?? null,
    invitations,
    memberCount: accepted ? 2 : 1,
    maxMembers: 2,
  });
}

/**
 * DELETE /api/repositories/:id/invitations/:invitationId
 * Project owner cancels a pending invitation.
 */
export async function cancelProjectInvitation(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const invitationId = req.params.invitationId as string;
  const userId = (req as AuthenticatedRequest).user?.sub;

  const invitation = invitationId
    ? await db.projectInvitation.findUnique({
        where: { id: invitationId },
        include: { repository: true, invitee: true },
      })
    : await db.projectInvitation.findFirst({
        where: { repositoryId, status: "PENDING" },
        include: { repository: true, invitee: true },
      });

  if (!invitation || invitation.repositoryId !== repositoryId) {
    throw new HttpError(404, "No pending invitation found for this project.");
  }

  const ownerId = invitation.repository.ownerId ?? (invitation.repository as any).userId;
  if (ownerId && ownerId !== userId) {
    throw new HttpError(403, "Forbidden: Only the project owner can cancel invitations.");
  }

  if (invitation.status !== "PENDING") {
    throw new HttpError(400, "Only pending invitations can be canceled.");
  }

  await db.projectInvitation.delete({
    where: { id: invitation.id },
  });

  void logActivity({
    repositoryId,
    userId: userId || null,
    activityType: "ACCESS_REVOKED",
    title: "Invitation canceled",
    description: `Canceled pending invitation for ${invitation.invitee?.email || "user"}.`,
  });

  res.json({
    success: true,
    message: "Invitation canceled successfully.",
  });
}

/**
 * DELETE /api/repositories/:id/collaborator
 * Remove collaborator from project (owner removes collaborator or collaborator leaves).
 */
export async function removeCollaborator(req: Request, res: Response) {
  const repositoryId = idParam(req);
  const userId = (req as AuthenticatedRequest).user?.sub;

  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
  });

  if (!repo) {
    throw new HttpError(404, "Repository not found.");
  }

  const ownerId = repo.ownerId ?? (repo as any).userId;
  const acceptedInvite = await db.projectInvitation.findFirst({
    where: {
      repositoryId,
      status: "ACCEPTED",
    },
    include: { invitee: true },
  });

  if (!acceptedInvite) {
    throw new HttpError(404, "No active collaborator found for this project.");
  }

  // Only the owner or the collaborator themselves can remove the collaboration
  const isOwner = !ownerId || ownerId === userId;
  const isCollaborator = acceptedInvite.inviteeId === userId;

  if (!isOwner && !isCollaborator) {
    throw new HttpError(403, "Forbidden: You are not authorized to remove this collaborator.");
  }

  await db.projectInvitation.delete({
    where: { id: acceptedInvite.id },
  });

  void logActivity({
    repositoryId,
    userId: userId || null,
    activityType: "ACCESS_REVOKED",
    title: isCollaborator ? "Collaborator left project" : "Collaborator removed",
    description: `${acceptedInvite.invitee?.email || "Collaborator"} is no longer a collaborator.`,
  });

  res.json({
    success: true,
    message: "Collaborator removed successfully.",
  });
}

/**
 * GET /api/invitations
 * List all pending invitations sent to the currently authenticated user.
 */
export async function listMyInvitations(req: Request, res: Response) {
  const userId = (req as AuthenticatedRequest).user?.sub;
  if (!userId) throw new HttpError(401, "Authentication required.");

  const invitations = await db.projectInvitation.findMany({
    where: {
      inviteeId: userId,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: {
      inviter: { select: { id: true, email: true } },
      repository: {
        select: {
          id: true,
          name: true,
          owner: true,
          totalFiles: true,
          totalLines: true,
          techStack: true,
          status: true,
        },
      },
    },
  });

  res.json({ invitations });
}

/**
 * POST /api/invitations/:id/accept
 * Intended invitee accepts a pending invitation.
 */
export async function acceptInvitation(req: Request, res: Response) {
  const invitationId = req.params.id as string;
  const userId = (req as AuthenticatedRequest).user?.sub;
  if (!userId) throw new HttpError(401, "Authentication required.");

  const invitation = await db.projectInvitation.findUnique({
    where: { id: invitationId },
    include: { repository: true },
  });

  if (!invitation) {
    throw new HttpError(404, "Invitation not found.");
  }

  if (invitation.status !== "PENDING") {
    throw new HttpError(400, "This invitation is no longer pending.");
  }

  // Ensure only the intended invitee can accept
  if (invitation.inviteeId !== userId) {
    throw new HttpError(403, "Forbidden: Only the intended invitee can accept this invitation.");
  }

  // Enforce max 2 users per project: verify project hasn't filled up
  const activeCollaborator = await db.projectInvitation.findFirst({
    where: {
      repositoryId: invitation.repositoryId,
      status: "ACCEPTED",
    },
  });

  if (activeCollaborator) {
    throw new HttpError(400, "Project has already reached its maximum capacity of 2 users.");
  }

  // Grant access by updating status to ACCEPTED
  await db.projectInvitation.update({
    where: { id: invitationId },
    data: { status: "ACCEPTED" },
  });

  void logActivity({
    repositoryId: invitation.repositoryId,
    userId,
    activityType: "PROJECT_SHARED",
    title: "Invitation accepted",
    description: "Accepted invitation to collaborate on project.",
  });

  res.json({
    success: true,
    message: "Invitation accepted successfully.",
    repositoryId: invitation.repositoryId,
  });
}

/**
 * POST /api/invitations/:id/reject
 * Intended invitee rejects a pending invitation.
 */
export async function rejectInvitation(req: Request, res: Response) {
  const invitationId = req.params.id as string;
  const userId = (req as AuthenticatedRequest).user?.sub;
  if (!userId) throw new HttpError(401, "Authentication required.");

  const invitation = await db.projectInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new HttpError(404, "Invitation not found.");
  }

  if (invitation.status !== "PENDING") {
    throw new HttpError(400, "This invitation is no longer pending.");
  }

  // Ensure only the intended invitee can reject
  if (invitation.inviteeId !== userId) {
    throw new HttpError(403, "Forbidden: Only the intended invitee can reject this invitation.");
  }

  await db.projectInvitation.update({
    where: { id: invitationId },
    data: { status: "REJECTED" },
  });

  void logActivity({
    repositoryId: invitation.repositoryId,
    userId,
    activityType: "ACCESS_REVOKED",
    title: "Invitation declined",
    description: "Invitee declined the invitation to collaborate.",
  });

  res.json({
    success: true,
    message: "Invitation rejected.",
  });
}

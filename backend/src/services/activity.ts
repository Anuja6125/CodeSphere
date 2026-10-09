import { db } from "../lib/db";
import { ActivityType, Prisma } from "@prisma/client";

export interface LogActivityParams {
  repositoryId: string;
  userId?: string | null;
  activityType: ActivityType;
  title: string;
  description?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Persists an activity event to the repository's audit and history trail.
 */
export async function logActivity({
  repositoryId,
  userId,
  activityType,
  title,
  description,
  metadata,
}: LogActivityParams): Promise<void> {
  try {
    await db.projectActivity.create({
      data: {
        repositoryId,
        userId: userId || null,
        activityType,
        title,
        description: description || null,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    console.warn(`[activity] Failed to log activity ${activityType} for repo ${repositoryId}:`, err);
  }
}

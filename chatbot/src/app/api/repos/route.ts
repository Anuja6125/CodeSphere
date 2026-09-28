import { NextRequest, NextResponse } from "next/server";
import { ingestRepository } from "@/lib/git/ingest";
import { db } from "@/lib/db";
import { Prisma, RepoStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Repository URL is required." }, { status: 400 });
    }

    // Step 1: Clone and scan repository
    let ingested;
    try {
      ingested = await ingestRepository(url);
    } catch (ingestErr: any) {
      return NextResponse.json(
        { error: `Repository scan failed: ${ingestErr.message}` },
        { status: 400 }
      );
    }

    const { owner, repoName, defaultBranch, files, totalFiles, totalLines, techStack } = ingested;
    const canonicalUrl = `https://github.com/${owner}/${repoName}.git`;

    // Step 2: Persist repository & files in PostgreSQL using Prisma transaction
    const repoRecord = await db.$transaction(
      async (tx) => {
        const repoData = {
          name: repoName,
          owner,
          defaultBranch,
          status: RepoStatus.INDEXED,
          totalFiles,
          totalLines,
          techStack: techStack as unknown as Prisma.InputJsonValue,
        };

        let repoResult;

        // Check for duplicate repository URL
        const existingRepo = await tx.repository.findUnique({
          where: { url: canonicalUrl },
        });

        if (existingRepo) {
          // Delete existing files to allow re-indexing
          await tx.repoFile.deleteMany({
            where: { repositoryId: existingRepo.id },
          });

          // Update existing repository record
          repoResult = await tx.repository.update({
            where: { id: existingRepo.id },
            data: repoData,
          });
        } else {
          // Create new repository record
          repoResult = await tx.repository.create({
            data: { ...repoData, url: canonicalUrl },
          });
        }

        // Insert files in batches to prevent massive queries
        const BATCH_SIZE = 500;
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          await tx.repoFile.createMany({
            data: files.slice(i, i + BATCH_SIZE).map((f: any) => ({
              repositoryId: repoResult.id,
              path: f.path,
              name: f.name,
              extension: f.extension,
              size: f.size,
              isDirectory: f.isDirectory,
              content: f.content ? f.content.replace(/\0/g, "") : null,
              linesCount: f.linesCount,
            })),
          });
        }

        return repoResult;
      },
      {
        maxWait: 5000, // default is 2000
        timeout: 30000, // default is 5000
      }
    );

    return NextResponse.json({
      success: true,
      repository: {
        id: repoRecord.id,
        name: repoRecord.name,
        owner: repoRecord.owner,
        url: repoRecord.url,
        defaultBranch: repoRecord.defaultBranch,
        status: repoRecord.status,
        totalFiles: repoRecord.totalFiles,
        totalLines: repoRecord.totalLines,
        techStack: repoRecord.techStack,
        createdAt: repoRecord.createdAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to persist repository in database." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const repositories = await db.repository.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        owner: true,
        url: true,
        defaultBranch: true,
        status: true,
        totalFiles: true,
        totalLines: true,
        techStack: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ repositories });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch repositories." },
      { status: 500 }
    );
  }
}

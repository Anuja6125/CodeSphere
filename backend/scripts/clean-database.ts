import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";

async function main() {
  console.log("=== Starting complete database and storage cleanup ===");

  // 1. Wipe all database tables
  console.log("Deleting ChatMessage...");
  await db.chatMessage.deleteMany({});

  console.log("Deleting ProjectActivity...");
  await db.projectActivity.deleteMany({});

  console.log("Deleting ProjectAccess...");
  await db.projectAccess.deleteMany({});

  console.log("Deleting EmailOtp...");
  await db.emailOtp.deleteMany({});

  console.log("Deleting CodeChunk...");
  await db.codeChunk.deleteMany({});

  console.log("Deleting FileDependency...");
  await db.fileDependency.deleteMany({});

  console.log("Deleting AnalysisReport...");
  await db.analysisReport.deleteMany({});

  console.log("Deleting RepositoryAnalysis...");
  await db.repositoryAnalysis.deleteMany({});

  console.log("Deleting RepositoryGraph...");
  await db.repositoryGraph.deleteMany({});

  console.log("Deleting Documentation...");
  await db.documentation.deleteMany({});

  console.log("Deleting RepoFile...");
  await db.repoFile.deleteMany({});

  console.log("Deleting Repository...");
  await db.repository.deleteMany({});

  console.log("Deleting User...");
  await db.user.deleteMany({});

  console.log("Database wiped successfully!");

  // 2. Clean uploads directory (leave .gitkeep)
  const uploadsDir = path.resolve(__dirname, "../uploads");
  if (fs.existsSync(uploadsDir)) {
    const items = fs.readdirSync(uploadsDir);
    for (const item of items) {
      if (item === ".gitkeep") continue;
      const fullPath = path.join(uploadsDir, item);
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`Removed upload: ${item}`);
    }
  }

  // 3. Clean extracted directory (leave .gitkeep)
  const extractedDir = path.resolve(__dirname, "../extracted");
  if (fs.existsSync(extractedDir)) {
    const items = fs.readdirSync(extractedDir);
    for (const item of items) {
      if (item === ".gitkeep") continue;
      const fullPath = path.join(extractedDir, item);
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`Removed extracted: ${item}`);
    }
  }

  // Verification counts
  const userCount = await db.user.count();
  const repoCount = await db.repository.count();
  const fileCount = await db.repoFile.count();
  const chunkCount = await db.codeChunk.count();

  console.log("\n=== Final Verification ===");
  console.log(`Users remaining: ${userCount}`);
  console.log(`Repositories remaining: ${repoCount}`);
  console.log(`Files remaining: ${fileCount}`);
  console.log(`Code Chunks remaining: ${chunkCount}`);
}

main()
  .catch((err) => {
    console.error("Cleanup error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(0);
  });

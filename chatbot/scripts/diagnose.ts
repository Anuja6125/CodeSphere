import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function diagnose() {
  try {
    console.log("=== REPOSITORY STATE ===");
    const repos = await prisma.repository.findMany({
      select: {
        id: true,
        name: true,
        owner: true,
        status: true,
        totalFiles: true,
        totalLines: true,
        techStack: true,
        defaultBranch: true,
      },
    });
    console.log(JSON.stringify(repos, null, 2));

    for (const repo of repos) {
      console.log(`\n=== REPO: ${repo.owner}/${repo.name} (${repo.id}) ===`);
      console.log(`Status: ${repo.status}`);
      console.log(`TechStack: ${JSON.stringify(repo.techStack)}`);

      // File count
      const fileCount = await prisma.repoFile.count({
        where: { repositoryId: repo.id },
      });
      console.log(`RepoFile records: ${fileCount}`);

      // Chunk counts
      const totalChunks = await prisma.codeChunk.count({
        where: { repositoryId: repo.id },
      });
      console.log(`Total CodeChunk records: ${totalChunks}`);

      const embeddedChunks = await prisma.codeChunk.count({
        where: { repositoryId: repo.id, embeddingStatus: "EMBEDDED" },
      });
      console.log(`Embedded CodeChunks: ${embeddedChunks}`);

      const pendingChunks = await prisma.codeChunk.count({
        where: { repositoryId: repo.id, embeddingStatus: "PENDING" },
      });
      console.log(`Pending CodeChunks: ${pendingChunks}`);

      const failedChunks = await prisma.codeChunk.count({
        where: { repositoryId: repo.id, embeddingStatus: "FAILED" },
      });
      console.log(`Failed CodeChunks: ${failedChunks}`);

      // Check embedding models used
      const models = await prisma.$queryRaw`
        SELECT DISTINCT "embeddingModel" 
        FROM "CodeChunk" 
        WHERE "repositoryId" = ${repo.id}::text AND "embeddingModel" IS NOT NULL
      `;
      console.log(`Embedding models used: ${JSON.stringify(models)}`);

      // Check vector dimensions of embedded chunks
      const dimCheck = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as count,
          CASE WHEN vector_dims(embedding) = 1024 THEN 'correct_1024' ELSE 'wrong_dim' END as dim_status
        FROM "CodeChunk"
        WHERE "repositoryId" = ${repo.id}::text AND embedding IS NOT NULL
        GROUP BY dim_status
      `;
      console.log(`Vector dimension check: ${JSON.stringify(dimCheck, (k, v) => typeof v === 'bigint' ? Number(v) : v)}`);

      // Check if analysis exists
      const analysis = await prisma.repositoryAnalysis.findUnique({
        where: { repositoryId: repo.id },
        select: {
          languages: true,
          frameworks: true,
          sourceFileCount: true,
          chunkCount: true,
          entryPoints: true,
          importantDirectories: true,
        },
      });
      console.log(`Analysis exists: ${!!analysis}`);
      if (analysis) {
        console.log(`  Languages: ${JSON.stringify(analysis.languages)}`);
        console.log(`  Frameworks: ${JSON.stringify(analysis.frameworks)}`);
        console.log(`  SourceFiles: ${analysis.sourceFileCount}, Chunks: ${analysis.chunkCount}`);
        console.log(`  Directories: ${JSON.stringify(analysis.importantDirectories)}`);
      }

      // Check for README content
      const readmeFile = await prisma.repoFile.findFirst({
        where: {
          repositoryId: repo.id,
          name: { in: ["README.md", "readme.md", "README", "README.txt"] },
        },
        select: { path: true, content: true },
      });
      console.log(`README file exists: ${!!readmeFile}`);
      if (readmeFile) {
        console.log(`  README path: ${readmeFile.path}`);
        console.log(`  README content length: ${readmeFile.content?.length || 0}`);
        console.log(`  README preview: ${readmeFile.content?.substring(0, 200).replace(/\n/g, ' ')}`);
      }

      // Check excluded/sensitive files
      const excludedFiles = await prisma.repoFile.count({
        where: { repositoryId: repo.id, isExcluded: true },
      });
      const sensitiveFiles = await prisma.repoFile.count({
        where: { repositoryId: repo.id, isSensitive: true },
      });
      console.log(`Excluded files: ${excludedFiles}`);
      console.log(`Sensitive files: ${sensitiveFiles}`);

      // Sample some chunks to see what types exist
      const chunkTypes = await prisma.$queryRaw`
        SELECT "chunkType", COUNT(*) as count
        FROM "CodeChunk"
        WHERE "repositoryId" = ${repo.id}::text
        GROUP BY "chunkType"
      `;
      console.log(`Chunk types: ${JSON.stringify(chunkTypes, (k, v) => typeof v === 'bigint' ? Number(v) : v)}`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();

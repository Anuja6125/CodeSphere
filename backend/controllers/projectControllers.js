const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { scanDirectory } = require("../utils/fileScanner");
const { analyzeDependencies } = require("../utils/dependencyAnalyzer");
const { buildProjectStats } = require("../utils/projectStats");
const { buildWhereToStart } = require("../utils/projectGuidance");
const { resolveProjectRoot } = require("../utils/projectRoot");
const { parseGithubUrl, downloadRepoArchive } = require("../utils/githubRepo");

const getExtractPath = (projectId) => {
    return path.join(__dirname, "../extracted", projectId);
};

const getUploadPath = (projectId) => {
    return path.join(__dirname, "../uploads", projectId);
};

const analyzeExtractedProject = (extractPath) => {
    const projectRoot = resolveProjectRoot(extractPath);
    const files = scanDirectory(projectRoot);
    const { dependencies, unresolved, fileGraph } = analyzeDependencies(projectRoot, files);
    const stats = buildProjectStats(files, dependencies, unresolved, fileGraph);
    const whereToStart = buildWhereToStart(stats, unresolved);

    return {
        files,
        dependencies,
        unresolved,
        fileGraph,
        stats,
        whereToStart
    };
};

const uploadProject = (req, res) => {

    if (!req.file) {
        return res.status(400).json({
            message: "No file uploaded"
        });
    }

    const projectId = req.projectId;
    const extractPath = getExtractPath(projectId);
    const zip = new AdmZip(req.file.path);

    zip.extractAllTo(extractPath, true);

    const analysis = analyzeExtractedProject(extractPath);

    res.status(200).json({
        message: "Project uploaded and extracted successfully",
        projectId: projectId,
        ...analysis
    });

};

const getProject = (req, res) => {

    const { projectId } = req.params;
    const extractPath = getExtractPath(projectId);

    if (!fs.existsSync(extractPath)) {
        return res.status(404).json({
            message: "Project not found"
        });
    }

    const analysis = analyzeExtractedProject(extractPath);

    res.status(200).json({
        message: "Project analysis retrieved successfully",
        projectId: projectId,
        ...analysis
    });

};

// POST /analyze-repo  { url: "https://github.com/owner/repo" }
// Downloads the repo as a ZIP from GitHub, then runs the exact same analysis as /upload.
const analyzeRepo = async (req, res) => {

    const repoUrl = req.body && req.body.url;

    try {
        const repoInfo = parseGithubUrl(repoUrl);
        const projectId = crypto.randomUUID();

        const archive = await downloadRepoArchive(repoInfo, getUploadPath(projectId));

        const extractPath = getExtractPath(projectId);
        const zip = new AdmZip(archive.zipPath);
        zip.extractAllTo(extractPath, true);

        const analysis = analyzeExtractedProject(extractPath);

        res.status(200).json({
            message: "Repository downloaded and analyzed successfully",
            projectId: projectId,
            source: {
                type: "github",
                url: repoUrl,
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                ref: repoInfo.ref || "HEAD",
                archiveUrl: archive.archiveUrl,
                bytes: archive.bytes
            },
            ...analysis
        });
    } catch (error) {
        res.status(error.status || 400).json({
            message: error.message
        });
    }

};

module.exports = {
    uploadProject,
    getProject,
    analyzeRepo
};
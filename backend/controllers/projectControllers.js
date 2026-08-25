const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const { scanDirectory } = require("../utils/fileScanner");
const { analyzeDependencies } = require("../utils/dependencyAnalyzer");
const { buildProjectStats } = require("../utils/projectStats");
const { buildWhereToStart } = require("../utils/projectGuidance");

const getExtractPath = (projectId) => {
    return path.join(__dirname, "../extracted", projectId);
};

const analyzeExtractedProject = (extractPath) => {
    const files = scanDirectory(extractPath);
    const { dependencies, unresolved, fileGraph } = analyzeDependencies(extractPath, files);
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

module.exports = {
    uploadProject,
    getProject
};
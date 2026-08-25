const AdmZip = require("adm-zip");
const path = require("path");
const { scanDirectory } = require("../utils/fileScanner");

const uploadProject = (req, res) => {

    if (!req.file) {
        return res.status(400).json({
            message: "No file uploaded"
        });
    }

    const projectId = req.projectId;

    const zip = new AdmZip(req.file.path);

    const extractPath = path.join(
        __dirname,
        "../extracted",
        projectId
    );

    zip.extractAllTo(extractPath, true);
    
    const files = scanDirectory(extractPath);

    res.status(200).json({
        message: "Project uploaded and extracted successfully",
        projectId: projectId,
        files: files
    });

};

module.exports = {
    uploadProject
};
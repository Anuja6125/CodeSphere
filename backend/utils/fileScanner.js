const fs = require("fs");
const path = require("path");

const allowedExtensions = [".js", ".jsx", ".ts", ".tsx"];
const ignoredDirectories = ["node_modules", ".git", "__MACOSX"];

const scanDirectory = (directoryPath, projectRoot = directoryPath) => {
    const files = [];

    const items = fs.readdirSync(directoryPath);

    for (const item of items) {

        if (ignoredDirectories.includes(item)) {
            continue;
        }

        const fullPath = path.join(directoryPath, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {

            files.push(...scanDirectory(fullPath, projectRoot));

        } else {

            const extension = path.extname(item).toLowerCase();

            if (allowedExtensions.includes(extension)) {
                const relativePath = path
                    .relative(projectRoot, fullPath)
                    .split(path.sep)
                    .join("/");

                files.push(relativePath);
            }
        }
    }

    return files;
};

module.exports = {
    scanDirectory
};
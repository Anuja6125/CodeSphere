const fs = require("fs");
const path = require("path");
const {
    MAX_FILE_SIZE_BYTES,
    isGeneratedFile,
    isIgnoredDirectory,
    isSupportedFile
} = require("./languageSupport");

/**
 * Walk a project folder and return every graph-relevant file as a "/"-separated
 * path relative to the project root. Covers source files in many languages plus
 * build/project configuration (see languageSupport.js). Skips dependency folders,
 * build output, generated/minified files, symlinks and oversized files.
 */
const scanDirectory = (directoryPath, projectRoot = directoryPath) => {
    const files = [];

    let items;
    try {
        items = fs.readdirSync(directoryPath);
    } catch {
        return files; // unreadable folder: skip it, keep scanning the rest
    }

    for (const item of items) {

        if (isIgnoredDirectory(item)) {
            continue;
        }

        const fullPath = path.join(directoryPath, item);
        let stats;
        try {
            // lstat: never follow symlinks (they can loop or point outside the project).
            stats = fs.lstatSync(fullPath);
        } catch {
            continue;
        }

        if (stats.isSymbolicLink()) {
            continue;
        }

        if (stats.isDirectory()) {

            files.push(...scanDirectory(fullPath, projectRoot));

        } else if (stats.isFile()) {

            const relativePath = path
                .relative(projectRoot, fullPath)
                .split(path.sep)
                .join("/");

            if (!isSupportedFile(relativePath)) continue;
            if (isGeneratedFile(item)) continue;
            if (stats.size > MAX_FILE_SIZE_BYTES) continue;

            files.push(relativePath);
        }
    }

    return files.sort();
};

module.exports = {
    scanDirectory
};
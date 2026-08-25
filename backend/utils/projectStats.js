const buildProjectStats = (files, dependencies, unresolved, fileGraph) => {
    const entryFiles = [];
    const leafFiles = [];
    const isolatedFiles = [];
    const importedCounts = [];

    for (const file of files) {
        const node = fileGraph[file];
        const dependsOnCount = node.dependsOn.length;
        const dependedByCount = node.dependedBy.length;

        if (dependedByCount === 0 && dependsOnCount > 0) {
            entryFiles.push(file);
        }

        if (dependsOnCount === 0 && dependedByCount > 0) {
            leafFiles.push(file);
        }

        if (dependsOnCount === 0 && dependedByCount === 0) {
            isolatedFiles.push(file);
        }

        if (dependedByCount > 0) {
            importedCounts.push({
                file,
                importedByCount: dependedByCount
            });
        }
    }

    importedCounts.sort((a, b) => b.importedByCount - a.importedByCount);

    return {
        fileCount: files.length,
        dependencyCount: dependencies.length,
        unresolvedCount: unresolved.length,
        entryFiles,
        leafFiles,
        isolatedFiles,
        mostImported: importedCounts.slice(0, 5)
    };
};

module.exports = {
    buildProjectStats
};

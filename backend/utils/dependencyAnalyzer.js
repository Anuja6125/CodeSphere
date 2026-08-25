const fs = require("fs");
const path = require("path");

const sourceExtensions = [".js", ".jsx", ".ts", ".tsx"];
const indexFiles = sourceExtensions.map((ext) => `index${ext}`);

const stripComments = (code) => {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
};

const parseImportSpecifiers = (code) => {
    const source = stripComments(code);
    const specifiers = [];
    const seen = new Set();

    const patterns = [
        /\bimport\s+(?:type\s+)?['"]([^'"]+)['"]/g,
        /\bimport\s+(?:type\s+)?(?:[\w*\s{},]+)\s+from\s+['"]([^'"]+)['"]/g,
        /\bexport\s+(?:[\w*\s{},]+)\s+from\s+['"]([^'"]+)['"]/g,
        /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ];

    for (const pattern of patterns) {
        let match;

        while ((match = pattern.exec(source)) !== null) {
            const specifier = match[1];

            if (!seen.has(specifier)) {
                seen.add(specifier);
                specifiers.push(specifier);
            }
        }
    }

    return specifiers;
};

const isRelativeImport = (specifier) => {
    return specifier.startsWith("./") || specifier.startsWith("../");
};

const lookupFile = (candidate, fileIndex) => {
    return fileIndex.get(candidate.toLowerCase()) || null;
};

const resolveRelativeImport = (sourceFile, specifier, fileIndex) => {
    const fromDirectory = path.posix.dirname(sourceFile);
    const resolvedBase = path.posix.normalize(
        path.posix.join(fromDirectory, specifier)
    );

    const hasExtension = sourceExtensions.includes(
        path.posix.extname(resolvedBase).toLowerCase()
    );

    const candidates = hasExtension
        ? [resolvedBase]
        : [
            resolvedBase,
            ...sourceExtensions.map((ext) => `${resolvedBase}${ext}`),
            ...indexFiles.map((indexFile) => `${resolvedBase}/${indexFile}`)
        ];

    for (const candidate of candidates) {
        const match = lookupFile(candidate, fileIndex);

        if (match) {
            return match;
        }
    }

    return null;
};

const buildFileGraph = (files, dependencies) => {
    const fileGraph = {};

    for (const file of files) {
        fileGraph[file] = {
            dependsOn: [],
            dependedBy: []
        };
    }

    for (const { source, target } of dependencies) {
        if (fileGraph[source]) {
            fileGraph[source].dependsOn.push(target);
        }

        if (fileGraph[target]) {
            fileGraph[target].dependedBy.push(source);
        }
    }

    return fileGraph;
};

const analyzeDependencies = (projectRoot, files) => {
    const fileIndex = new Map();

    for (const file of files) {
        fileIndex.set(file.toLowerCase(), file);
    }

    const dependencies = [];
    const unresolved = [];
    const seenEdges = new Set();

    for (const sourceFile of files) {
        const extension = path.posix.extname(sourceFile).toLowerCase();

        if (!sourceExtensions.includes(extension)) {
            continue;
        }

        const absolutePath = path.join(projectRoot, sourceFile);
        const content = fs.readFileSync(absolutePath, "utf8");
        const specifiers = parseImportSpecifiers(content);

        for (const specifier of specifiers) {
            if (!isRelativeImport(specifier)) {
                continue;
            }

            const targetFile = resolveRelativeImport(
                sourceFile,
                specifier,
                fileIndex
            );

            if (!targetFile) {
                unresolved.push({
                    source: sourceFile,
                    specifier
                });
                continue;
            }

            const edgeKey = `${sourceFile}->${targetFile}`;

            if (seenEdges.has(edgeKey)) {
                continue;
            }

            seenEdges.add(edgeKey);
            dependencies.push({
                source: sourceFile,
                target: targetFile
            });
        }
    }

    return {
        dependencies,
        unresolved,
        fileGraph: buildFileGraph(files, dependencies)
    };
};

module.exports = {
    analyzeDependencies
};

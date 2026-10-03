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

    return resolveFromBase(resolvedBase, fileIndex);
};

const resolveFromBase = (resolvedBase, fileIndex) => {
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

// ---- Path aliases ("@/components/x") from tsconfig.json / jsconfig.json ----

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];

// tsconfig allows comments and trailing commas. Strip them before JSON.parse.
// Walks char by char so "./*" inside a string is not mistaken for a comment.
const parseJsonLoose = (text) => {
    let out = "";
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (inString) {
            out += ch;
            if (ch === "\\") { out += next || ""; i++; }
            else if (ch === '"') inString = false;
        } else if (ch === '"') {
            inString = true;
            out += ch;
        } else if (ch === "/" && next === "/") {
            while (i < text.length && text[i] !== "\n") i++;
            out += "\n";
        } else if (ch === "/" && next === "*") {
            i += 2;
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
            i++;
        } else {
            out += ch;
        }
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
};

// Find every tsconfig/jsconfig with "paths". Monorepos can have several.
const loadAliasConfigs = (projectRoot, files) => {
    const configs = [];
    const configFiles = new Set();

    // Config files are .json, so they are not in "files". Look next to each source folder.
    const folders = new Set([""]);
    for (const file of files) {
        let dir = path.posix.dirname(file);
        while (dir && dir !== "." && !folders.has(dir)) {
            folders.add(dir);
            dir = path.posix.dirname(dir);
        }
    }
    for (const folder of folders) {
        for (const name of CONFIG_NAMES) {
            const rel = folder ? `${folder}/${name}` : name;
            if (!configFiles.has(rel) && fs.existsSync(path.join(projectRoot, rel))) {
                configFiles.add(rel);
            }
        }
    }

    for (const rel of configFiles) {
        try {
            const json = parseJsonLoose(fs.readFileSync(path.join(projectRoot, rel), "utf8"));
            const options = (json && json.compilerOptions) || {};
            if (!options.paths) continue;

            const configDir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
            const baseDir = path.posix.normalize(path.posix.join(configDir || ".", options.baseUrl || "."));
            const aliases = Object.entries(options.paths).map(([pattern, targets]) => ({
                prefix: pattern.replace(/\*$/, ""),
                wildcard: pattern.endsWith("*"),
                targets: (Array.isArray(targets) ? targets : []).map((t) => t.replace(/\*$/, ""))
            }));
            configs.push({ dir: configDir, baseDir: baseDir === "." ? "" : baseDir, aliases });
        } catch {
            // Broken config file. Skip it and keep analyzing.
        }
    }

    // Deepest folder first, so the nearest config wins.
    return configs.sort((a, b) => b.dir.length - a.dir.length);
};

const resolveAliasImport = (sourceFile, specifier, aliasConfigs, fileIndex) => {
    const config = aliasConfigs.find((c) => !c.dir || sourceFile.startsWith(`${c.dir}/`));
    if (!config) return null;

    for (const alias of config.aliases) {
        const matches = alias.wildcard ? specifier.startsWith(alias.prefix) : specifier === alias.prefix;
        if (!matches) continue;

        const rest = alias.wildcard ? specifier.slice(alias.prefix.length) : "";
        for (const target of alias.targets) {
            const base = path.posix.normalize(path.posix.join(config.baseDir || ".", target + rest));
            const found = resolveFromBase(base.replace(/^\.\//, ""), fileIndex);
            if (found) return found;
        }
    }
    return null;
};

const isAliasCandidate = (specifier, aliasConfigs) => {
    return aliasConfigs.some((c) => c.aliases.some((a) => specifier.startsWith(a.prefix)));
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

    const aliasConfigs = loadAliasConfigs(projectRoot, files);
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
            const relative = isRelativeImport(specifier);
            const alias = !relative && isAliasCandidate(specifier, aliasConfigs);

            // Packages like "react" are external. Skip them.
            if (!relative && !alias) {
                continue;
            }

            const targetFile = relative
                ? resolveRelativeImport(sourceFile, specifier, fileIndex)
                : resolveAliasImport(sourceFile, specifier, aliasConfigs, fileIndex);

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

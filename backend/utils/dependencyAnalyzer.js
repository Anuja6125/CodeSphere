const fs = require("fs");
const path = require("path");
const { detectLanguage, isSupportedFile, projectHasCpp } = require("./languageSupport");

const PARSERS = [
    require("./parsers/javascript"),
    require("./parsers/python"),
    require("./parsers/jvm"),
    require("./parsers/cfamily"),
    require("./parsers/csharp"),
    require("./parsers/go"),
    require("./parsers/php"),
    require("./parsers/ruby"),
    require("./parsers/htmlcss"),
    require("./parsers/rust"),
    require("./parsers/config")
];

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

const createContext = (projectRoot, files, languageByFile) => {
    const fileIndex = new Map();
    for (const file of files) {
        fileIndex.set(file.toLowerCase(), file);
    }

    const contentCache = new Map();

    return {
        projectRoot,
        files,
        lookup: (candidate) => {
            if (candidate === null || candidate === undefined || candidate === "") {
                return fileIndex.get("") || null;
            }
            return fileIndex.get(String(candidate).toLowerCase()) || null;
        },
        has: (candidate) => fileIndex.has(String(candidate).toLowerCase()),
        languageOf: (file) => languageByFile.get(file) || detectLanguage(file),
        isSupported: (rel) => isSupportedFile(rel),
        existsOnDisk: (rel) => {
            try {
                return fs.existsSync(path.join(projectRoot, rel));
            } catch {
                return false;
            }
        },
        read: (file) => {
            if (contentCache.has(file)) return contentCache.get(file);
            let text = "";
            try {
                text = fs.readFileSync(path.join(projectRoot, file), "utf8");
            } catch {
                text = "";
            }
            contentCache.set(file, text);
            return text;
        }
    };
};

const analyzeDependencies = (projectRoot, files) => {
    const cppProject = projectHasCpp(files);
    const languageByFile = new Map();
    for (const file of files) {
        languageByFile.set(file, detectLanguage(file, { cppProject }));
    }

    const ctx = createContext(projectRoot, files, languageByFile);
    const dependencies = [];
    const unresolved = [];
    const seenEdges = new Set();
    const seenUnresolved = new Set();

    const bind = (sourceFile) => ({
        add: (dep, resolved) => {
            if (!dep || !resolved || resolved.external) return;
            if (resolved.target) {
                if (resolved.target === sourceFile) return;
                if (!ctx.has(resolved.target)) return;
                const edgeKey = `${sourceFile}->${resolved.target}`;
                if (seenEdges.has(edgeKey)) return;
                seenEdges.add(edgeKey);
                dependencies.push({
                    source: sourceFile,
                    target: resolved.target,
                    kind: dep.kind || "import",
                    specifier: dep.specifier
                });
                return;
            }
            if (resolved.unresolved) {
                const key = `${sourceFile}|${dep.specifier}|${resolved.unresolved}`;
                if (seenUnresolved.has(key)) return;
                seenUnresolved.add(key);
                unresolved.push({
                    source: sourceFile,
                    specifier: dep.specifier,
                    reason: resolved.unresolved
                });
            }
        }
    });

    for (const parser of PARSERS) {
        const owned = files.filter((file) => parser.languages.includes(languageByFile.get(file)));
        if (owned.length === 0) continue;

        let state = {};
        try {
            state = parser.prepare ? parser.prepare(ctx) : {};
        } catch {
            state = {};
        }

        for (const file of owned) {
            try {
                parser.analyze(file, ctx, state, bind(file));
            } catch {
                // One broken file must not abort analysis of the rest.
            }
        }
    }

    return {
        dependencies,
        unresolved,
        fileGraph: buildFileGraph(files, dependencies),
        languages: Object.fromEntries(languageByFile)
    };
};

module.exports = {
    analyzeDependencies
};

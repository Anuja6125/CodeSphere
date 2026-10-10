// Go dependency detection.
//
// Parsing: comments and strings are stripped, then `import "x"` and
// parenthesized import blocks are collected. Resolution uses go.mod:
//   * specifiers starting with the module path map onto project directories
//   * "./x" / "../x" are relative packages
//   * everything else (fmt, net/http, github.com/...) is external
// Each resolved package directory becomes edges to its non-test .go files.
const fs = require("fs");
const path = require("path");
const { C_STYLE, joinRel, matchAll, posixDir, stripCode } = require("./common");

const extractGoImports = (content) => {
    const code = stripCode(content, { ...C_STYLE, rawQuotes: ["`"] });
    const imports = [];
    const add = (spec, line) => {
        const cleaned = spec.trim().replace(/^[\w.]+\s+/, "").replace(/^["']|["']$/g, "");
        if (cleaned) imports.push({ specifier: cleaned, line });
    };

    for (const m of matchAll(/^[ \t]*import\s+"([^"]+)"/gm, code)) {
        add(m[1], code.slice(0, m.index).split("\n").length);
    }
    for (const m of matchAll(/^[ \t]*import\s*\(([\s\S]*?)\)/gm, code)) {
        const blockLine = code.slice(0, m.index).split("\n").length;
        for (const inner of matchAll(/"([^"]+)"/g, m[1])) {
            const localLine = m[1].slice(0, inner.index).split("\n").length - 1;
            add(inner[1], blockLine + localLine);
        }
    }
    return imports;
};

const prepare = (ctx) => {
    let modulePath = null;
    const goFilesByDir = new Map();

    for (const file of ctx.files) {
        if (path.posix.basename(file).toLowerCase() === "go.mod") {
            try {
                const text = fs.existsSync(path.join(ctx.projectRoot, file))
                    ? fs.readFileSync(path.join(ctx.projectRoot, file), "utf8")
                    : ctx.read(file);
                const match = text.match(/^module\s+(\S+)/m);
                if (match) modulePath = match[1];
            } catch {
                // ignore broken go.mod
            }
        }
        if (!file.endsWith(".go") || file.endsWith("_test.go")) continue;
        const dir = posixDir(file);
        if (!goFilesByDir.has(dir)) goFilesByDir.set(dir, []);
        goFilesByDir.get(dir).push(file);
    }

    return { modulePath, goFilesByDir };
};

const packageFiles = (dir, state) => state.goFilesByDir.get(dir === null ? "" : dir) || [];

const analyze = (file, ctx, state, result) => {
    for (const imp of extractGoImports(ctx.read(file))) {
        const dep = { specifier: imp.specifier, kind: "import", line: imp.line };
        const spec = imp.specifier;

        if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
            const dir = joinRel(posixDir(file), spec);
            const files = packageFiles(dir, state);
            if (files.length === 0) {
                result.add(dep, { unresolved: "not-found" });
            } else {
                for (const target of files) result.add(dep, { target });
            }
            continue;
        }

        if (state.modulePath && (spec === state.modulePath || spec.startsWith(`${state.modulePath}/`))) {
            const rest = spec.slice(state.modulePath.length).replace(/^\//, "");
            const dir = rest ? joinRel(rest) : "";
            const files = packageFiles(dir === null ? null : dir, state);
            if (files.length === 0) {
                result.add(dep, { unresolved: "not-found" });
            } else {
                for (const target of files) result.add(dep, { target });
            }
            continue;
        }

        result.add(dep, { external: true });
    }
};

module.exports = {
    name: "go",
    languages: ["Go"],
    prepare,
    analyze,
    extractGoImports
};

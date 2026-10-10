// Python dependency detection.
//
// Parsing: comments and string literals (incl. triple-quoted) are blanked by a
// tokenizer-aware scanner, then statements are rebuilt as logical lines
// (parentheses and "\" continuations joined, ";" split) before matching
// `import a.b as c` / `from .x import (y, z)`. Literal
// importlib.import_module("x") / __import__("x") calls are also detected.
// Resolution follows Python semantics: relative imports from the package dir;
// absolute imports from the package root (first ancestor without __init__.py),
// its ancestors, and src/ layouts. Unknown top-level names are external.
const { joinRel, posixDir, stripCode } = require("./common");

const PY_STRIP = { line: ["#"], quotes: ['"', "'"], triple: true };

/** Rebuild logical lines from comment/string-blanked Python code. */
const logicalLines = (code) => {
    const lines = code.split("\n");
    const result = [];
    let buffer = "";
    let startLine = 1;
    let depth = 0;

    lines.forEach((raw, index) => {
        if (!buffer) startLine = index + 1;
        let lineText = raw;
        const continued = /\\\s*$/.test(lineText);
        if (continued) lineText = lineText.replace(/\\\s*$/, " ");
        for (const ch of lineText) {
            if (ch === "(" || ch === "[" || ch === "{") depth++;
            else if ((ch === ")" || ch === "]" || ch === "}") && depth > 0) depth--;
        }
        buffer += `${lineText} `;
        if (depth === 0 && !continued) {
            for (const statement of buffer.split(";")) {
                if (statement.trim()) result.push({ text: statement.trim(), line: startLine });
            }
            buffer = "";
        }
    });
    if (buffer.trim()) result.push({ text: buffer.trim(), line: startLine });
    return result;
};

const extractPythonImports = (content) => {
    const imports = [];
    const blanked = stripCode(content, { ...PY_STRIP, blankStrings: true });

    for (const { text, line } of logicalLines(blanked)) {
        let m = text.match(/^import\s+(.+)$/);
        if (m) {
            for (const part of m[1].split(",")) {
                const name = part.trim().split(/\s+as\s+/)[0].trim();
                if (/^[\w.]+$/.test(name)) imports.push({ module: name, names: [], level: 0, line, kind: "import" });
            }
            continue;
        }
        m = text.match(/^from\s+(\.*)\s*([\w.]*)\s+import\s+(.+)$/);
        if (m) {
            const names = m[3]
                .replace(/[()]/g, " ")
                .split(",")
                .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
                .filter((n) => n && /^[\w*]+$/.test(n));
            imports.push({ module: m[2], names, level: m[1].length, line, kind: "from-import" });
        }
    }

    // Dynamic imports with a literal module name.
    const withStrings = stripCode(content, PY_STRIP);
    const dyn = /\b(?:importlib\.)?(?:import_module|__import__)\s*\(\s*['"]([\w.]+)['"]/g;
    let m;
    while ((m = dyn.exec(withStrings)) !== null) {
        const level = (m[1].match(/^\.*/) || [""])[0].length;
        imports.push({ module: m[1].slice(level), names: [], level, line: withStrings.slice(0, m.index).split("\n").length, kind: "dynamic-import" });
    }
    return imports;
};

// ---------------------------------------------------------------- resolution

const moduleFile = (dir, dotted, ctx) => {
    const rel = joinRel(dir, ...(dotted ? dotted.split(".") : []));
    if (rel === null) return null;
    const prefix = rel ? `${rel}/` : "";
    const candidates = dotted
        ? [`${rel}.py`, `${prefix}__init__.py`, `${rel}.pyi`, `${prefix}__init__.pyi`]
        : [`${prefix}__init__.py`, `${prefix}__init__.pyi`];
    for (const candidate of candidates) {
        const found = ctx.lookup(candidate);
        if (found) return found;
    }
    return null;
};

/** Directory that would be on sys.path for this file: top of its package chain. */
const packageRoot = (file, ctx) => {
    let dir = posixDir(file);
    while (dir && (ctx.has(`${dir}/__init__.py`) || ctx.has(`${dir}/__init__.pyi`))) {
        dir = posixDir(dir);
    }
    if (!dir && (ctx.has("__init__.py"))) return "";
    return dir;
};

const searchRoots = (file, ctx) => {
    const roots = [];
    const seen = new Set();
    const push = (dir) => {
        if (dir === null || seen.has(dir)) return;
        seen.add(dir);
        roots.push(dir);
    };
    let dir = packageRoot(file, ctx);
    for (;;) {
        push(dir);
        push(joinRel(dir, "src"));
        if (!dir) break;
        dir = posixDir(dir);
    }
    return roots;
};

/** Is `top` a local package/module directly under `root`? */
const isLocalTop = (root, top, state) => {
    return state.modulePaths.has(root ? `${root}/${top}` : top);
};

/** Longest existing module for a dotted name under one root. */
const longestModule = (root, dotted, ctx) => {
    const parts = dotted.split(".");
    for (let len = parts.length; len >= 1; len--) {
        const found = moduleFile(root, parts.slice(0, len).join("."), ctx);
        if (found) return found;
    }
    return null;
};

const analyze = (file, ctx, state, result) => {
    for (const imp of extractPythonImports(ctx.read(file))) {
        const spec = `${".".repeat(imp.level)}${imp.module}`;
        const dep = { specifier: spec || ".", kind: imp.kind, line: imp.line };

        if (imp.module === "__future__") {
            result.add(dep, { external: true });
            continue;
        }

        if (imp.level > 0) {
            // Relative import: "." = this package, ".." = parent, ...
            let baseDir = posixDir(file);
            let escaped = false;
            for (let i = 1; i < imp.level; i++) {
                if (!baseDir) { escaped = true; break; }
                baseDir = posixDir(baseDir);
            }
            if (escaped) {
                result.add(dep, { unresolved: "outside-project" });
                continue;
            }
            resolveFrom(baseDir, imp, dep, ctx, result, true);
            continue;
        }

        // Absolute import
        const top = imp.module.split(".")[0];
        const root = searchRoots(file, ctx).find((r) => isLocalTop(r, top, state));
        if (root === undefined) {
            result.add(dep, { external: true }); // stdlib or installed package
            continue;
        }
        resolveFrom(root, imp, dep, ctx, result, false);
    }
};

/** Resolve an import against a known base directory (package dir or sys.path root). */
const resolveFrom = (baseDir, imp, dep, ctx, result, relative) => {
    const targets = new Set();
    const moduleTarget = imp.module ? (relative ? moduleFile(baseDir, imp.module, ctx) : longestModule(baseDir, imp.module, ctx)) : null;

    if (imp.names.length > 0) {
        let needsModule = false;
        for (const name of imp.names) {
            // "from pkg import sub" may import a submodule rather than a name.
            const sub = name !== "*" ? moduleFile(baseDir, imp.module ? `${imp.module}.${name}` : name, ctx) : null;
            if (sub) targets.add(sub);
            else needsModule = true;
        }
        if (needsModule) {
            const container = imp.module ? moduleTarget : moduleFile(baseDir, "", ctx); // "from . import x" -> __init__.py
            if (container) targets.add(container);
        }
    } else if (moduleTarget) {
        targets.add(moduleTarget);
    }

    if (targets.size === 0) {
        result.add(dep, { unresolved: "not-found" });
        return;
    }
    for (const target of targets) result.add(dep, { target });
};

const prepare = (ctx) => {
    // Every directory and module path (without extension) that holds Python code.
    const modulePaths = new Set();
    for (const file of ctx.files) {
        if (!/\.pyi?$/i.test(file)) continue;
        modulePaths.add(file.replace(/\.pyi?$/i, ""));
        let dir = posixDir(file);
        while (dir && !modulePaths.has(dir)) {
            modulePaths.add(dir);
            dir = posixDir(dir);
        }
    }
    return { modulePaths };
};

module.exports = {
    name: "python",
    languages: ["Python"],
    prepare,
    analyze,
    extractPythonImports
};

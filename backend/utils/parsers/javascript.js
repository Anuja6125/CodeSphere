// JavaScript / TypeScript (+ Vue / Svelte <script> blocks) dependency detection.
//
// Parsing: TypeScript compiler API (syntax-only AST, no type checking) when the
// "typescript" package is available; otherwise a comment-aware regex fallback.
// Resolution: relative paths (Node + TS extension rules), tsconfig/jsconfig
// "paths" + "baseUrl" (following "extends"), and monorepo workspace packages.
const fs = require("fs");
const path = require("path");
const { ancestorDirs, joinRel, lineAt, posixDir, stripCode } = require("./common");

let ts = null;
try {
    // eslint-disable-next-line global-require
    ts = require("typescript");
} catch {
    ts = null; // regex fallback below
}

const JS_EXTS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".vue", ".svelte", ".json"];
const TS_EXTS = [".ts", ".tsx", ".d.ts", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".json"];
const CODE_EXTS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".vue", ".svelte", ".json"]);
// "./x.js" written in a TS file usually means "./x.ts" (NodeNext / ESM style).
const JS_TO_TS = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };

const isTsFile = (file) => /\.(ts|tsx|mts|cts)$/i.test(file);

// ---------------------------------------------------------------- extraction

const scriptKindFor = (fileName) => {
    const ext = path.posix.extname(fileName).toLowerCase();
    if (ext === ".tsx") return ts.ScriptKind.TSX;
    if (ext === ".ts" || ext === ".mts" || ext === ".cts") return ts.ScriptKind.TS;
    // Plain .js files frequently contain JSX (React); the JSX kind parses both.
    return ts.ScriptKind.JSX;
};

const extractWithTypeScript = (content, fileName) => {
    const sf = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, false, scriptKindFor(fileName));
    const found = [];
    const add = (specifier, kind, node) => {
        found.push({ specifier, kind, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    };

    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause;
            const kind = !clause ? "side-effect-import" : clause.isTypeOnly ? "import-type" : "import";
            add(node.moduleSpecifier.text, kind, node);
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            add(node.moduleSpecifier.text, "re-export", node);
        } else if (
            ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            ts.isStringLiteralLike(node.moduleReference.expression)
        ) {
            add(node.moduleReference.expression.text, "import", node);
        } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
            const callee = node.expression;
            const spec = node.arguments[0].text;
            if (callee.kind === ts.SyntaxKind.ImportKeyword) {
                add(spec, "dynamic-import", node);
            } else if (ts.isIdentifier(callee) && callee.text === "require") {
                add(spec, "require", node);
            } else if (
                ts.isPropertyAccessExpression(callee) &&
                ts.isIdentifier(callee.expression) &&
                callee.expression.text === "require" &&
                callee.name.text === "resolve"
            ) {
                add(spec, "require", node);
            }
        } else if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        ) {
            add(node.argument.literal.text, "import-type", node);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);

    for (const ref of sf.referencedFiles || []) {
        const spec = ref.fileName.startsWith(".") || ref.fileName.startsWith("/") ? ref.fileName : `./${ref.fileName}`;
        found.push({ specifier: spec, kind: "reference", line: lineAt(content, ref.pos) });
    }
    return found;
};

// Original regex parser, kept as the fallback when the TS parser is unavailable.
const extractWithRegex = (content) => {
    const source = stripCode(content, { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'", "`"] });
    const found = [];
    const patterns = [
        [/\bimport\s+(?:type\s+)?['"]([^'"]+)['"]/g, "side-effect-import"],
        [/\bimport\s+(type\s+)?(?:[\w*\s{},$]+)\s+from\s+['"]([^'"]+)['"]/g, "import"],
        [/\bexport\s+(?:type\s+)?(?:[\w*\s{},$]+)\s+from\s+['"]([^'"]+)['"]/g, "re-export"],
        [/\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, "require"],
        [/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, "dynamic-import"]
    ];
    for (const [pattern, kind] of patterns) {
        let m;
        while ((m = pattern.exec(source)) !== null) {
            const spec = m[m.length - 1];
            const isType = kind === "import" && m[1];
            found.push({ specifier: spec, kind: isType ? "import-type" : kind, line: lineAt(source, m.index) });
        }
    }
    return found;
};

const extractJsSpecifiers = (content, fileName) => {
    if (ts) {
        try {
            return extractWithTypeScript(content, fileName);
        } catch {
            // fall through to the regex parser
        }
    }
    return extractWithRegex(content);
};

/** <script> blocks of .vue/.svelte/.html files: [{ code, lang, src, lineOffset }] */
const extractScriptBlocks = (content) => {
    const blocks = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
        const attrs = m[1];
        const lang = (attrs.match(/\blang\s*=\s*["']?([\w-]+)/i) || [])[1] || "";
        const type = (attrs.match(/\btype\s*=\s*["']?([\w/+-]+)/i) || [])[1] || "";
        const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || null;
        blocks.push({
            code: m[2],
            lang: lang.toLowerCase(),
            type: type.toLowerCase(),
            src,
            lineOffset: lineAt(content, m.index + m[0].indexOf(">") + 1) - 1
        });
    }
    return blocks;
};

const extractFromFile = (file, content) => {
    const ext = path.posix.extname(file).toLowerCase();
    if (ext !== ".vue" && ext !== ".svelte") return extractJsSpecifiers(content, file);

    const found = [];
    for (const block of extractScriptBlocks(content)) {
        if (block.src) found.push({ specifier: block.src, kind: "script-src", line: block.lineOffset + 1 });
        const virtualName = `${file}.${block.lang === "ts" || block.lang === "typescript" ? "ts" : "js"}`;
        for (const dep of extractJsSpecifiers(block.code, virtualName)) {
            found.push({ ...dep, line: dep.line + block.lineOffset });
        }
    }
    return found;
};

// ---------------------------------------------------------------- tsconfig aliases

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];

// tsconfig allows comments and trailing commas. Strip them before JSON.parse.
const parseJsonLoose = (text) => {
    const cleaned = stripCode(text, { line: ["//"], block: [["/*", "*/"]], quotes: ['"'] });
    return JSON.parse(cleaned.replace(/,(\s*[}\]])/g, "$1"));
};

const readConfig = (projectRoot, rel, depth = 0) => {
    if (depth > 5) return null;
    let json;
    try {
        json = parseJsonLoose(fs.readFileSync(path.join(projectRoot, rel), "utf8"));
    } catch {
        return null;
    }
    const dir = posixDir(rel);
    let result = { paths: null, baseDir: null };

    // Follow relative "extends" (package-based extends point into node_modules).
    const parents = Array.isArray(json.extends) ? json.extends : json.extends ? [json.extends] : [];
    for (const parent of parents) {
        if (typeof parent !== "string" || !parent.startsWith(".")) continue;
        let parentRel = joinRel(dir, parent);
        if (parentRel && !parentRel.endsWith(".json")) parentRel += ".json";
        const inherited = parentRel ? readConfig(projectRoot, parentRel, depth + 1) : null;
        if (inherited) {
            if (inherited.paths) result.paths = inherited.paths;
            if (inherited.baseDir !== null) result.baseDir = inherited.baseDir;
        }
    }

    const options = (json && json.compilerOptions) || {};
    if (typeof options.baseUrl === "string") {
        result.baseDir = joinRel(dir, options.baseUrl) || "";
    }
    if (options.paths && typeof options.paths === "object") {
        // "paths" are relative to baseUrl when set, otherwise to the config file.
        const pathsBase = result.baseDir !== null ? result.baseDir : dir;
        result.paths = Object.entries(options.paths).map(([pattern, targets]) => ({
            prefix: pattern.replace(/\*$/, ""),
            wildcard: pattern.endsWith("*"),
            targets: (Array.isArray(targets) ? targets : [])
                .filter((t) => typeof t === "string")
                .map((t) => joinRel(pathsBase, t.replace(/\*$/, "")) ?? "")
        }));
    }
    return result;
};

const loadAliasConfigs = (ctx) => {
    const configs = [];
    const folders = new Set([""]);
    for (const file of ctx.files) {
        for (const dir of ancestorDirs(file)) folders.add(dir);
    }
    for (const folder of folders) {
        for (const name of CONFIG_NAMES) {
            const rel = folder ? `${folder}/${name}` : name;
            if (!fs.existsSync(path.join(ctx.projectRoot, rel))) continue;
            const config = readConfig(ctx.projectRoot, rel);
            if (config && (config.paths || config.baseDir !== null)) {
                configs.push({ dir: folder, ...config });
            }
        }
    }
    // Deepest folder first, so the nearest config wins.
    return configs.sort((a, b) => b.dir.length - a.dir.length);
};

// ---------------------------------------------------------------- workspace packages

const loadWorkspacePackages = (ctx) => {
    const packages = [];
    for (const file of ctx.files) {
        if (path.posix.basename(file) !== "package.json") continue;
        try {
            const json = JSON.parse(ctx.read(file));
            if (json && typeof json.name === "string" && json.name) {
                packages.push({ name: json.name, dir: posixDir(file), json });
            }
        } catch {
            // invalid package.json: ignore
        }
    }
    // Longest name first so "@org/ui-kit" wins over "@org/ui".
    return packages.sort((a, b) => b.name.length - a.name.length);
};

// ---------------------------------------------------------------- resolution

const candidatesFor = (base, importer) => {
    const exts = isTsFile(importer) ? TS_EXTS : JS_EXTS;
    const ext = path.posix.extname(base).toLowerCase();
    const list = [];
    if (ext) {
        list.push(base);
        for (const alt of JS_TO_TS[ext] || []) list.push(base.slice(0, -ext.length) + alt);
    }
    if (!ext || !CODE_EXTS.has(ext)) {
        for (const e of exts) list.push(base + e);
        for (const e of exts) list.push(`${base}/index${e}`);
    }
    return list;
};

const resolveFromBase = (base, importer, ctx) => {
    if (base === null || base === undefined) return null;
    for (const candidate of candidatesFor(base, importer)) {
        const match = ctx.lookup(candidate);
        if (match) return match;
    }
    return null;
};

/** Why a local-looking import did not resolve: target excluded from the graph, a non-code asset, or missing. */
const classifyMissing = (base, importer, ctx) => {
    if (base === null) return "outside-project";
    for (const candidate of [base, ...candidatesFor(base, importer)]) {
        if (ctx.existsOnDisk(candidate)) {
            return ctx.isSupported(candidate) ? "excluded" : "asset";
        }
    }
    return "not-found";
};

const resolveAlias = (importer, spec, state, ctx) => {
    const config = state.aliasConfigs.find((c) => !c.dir || importer.startsWith(`${c.dir}/`));
    if (!config) return { matched: false };
    let matched = false;

    for (const alias of config.paths || []) {
        const hit = alias.wildcard ? spec.startsWith(alias.prefix) : spec === alias.prefix;
        if (!hit) continue;
        matched = true;
        const rest = alias.wildcard ? spec.slice(alias.prefix.length) : "";
        for (const target of alias.targets) {
            const found = resolveFromBase(joinRel(target, rest), importer, ctx);
            if (found) return { matched: true, target: found, base: joinRel(target, rest) };
        }
    }
    // baseUrl lets "components/Button" mean "<baseUrl>/components/Button".
    if (config.baseDir !== null) {
        const found = resolveFromBase(joinRel(config.baseDir, spec), importer, ctx);
        if (found) return { matched: true, target: found };
    }
    return { matched };
};

const resolveWorkspacePackage = (importer, spec, state, ctx) => {
    const pkg = state.packages.find((p) => spec === p.name || spec.startsWith(`${p.name}/`));
    if (!pkg) return { matched: false };
    const rest = spec.slice(pkg.name.length).replace(/^\//, "");

    const bases = [];
    if (rest) {
        bases.push(joinRel(pkg.dir, rest), joinRel(pkg.dir, "src", rest));
    } else {
        const json = pkg.json;
        for (const field of ["source", "module", "main", "types", "typings"]) {
            const value = json[field];
            if (typeof value !== "string") continue;
            bases.push(joinRel(pkg.dir, value));
            // "dist/index.js" is build output; the source usually lives in src/.
            const srcGuess = value.replace(/^\.?\/?(dist|build|lib|out)\//, "src/").replace(/(\.d)?\.[cm]?[jt]sx?$/, "");
            if (srcGuess !== value) bases.push(joinRel(pkg.dir, srcGuess));
        }
        bases.push(joinRel(pkg.dir, "src/index"), joinRel(pkg.dir, "index"));
    }
    for (const base of bases) {
        const found = resolveFromBase(base, importer, ctx);
        if (found) return { matched: true, target: found };
    }
    return { matched: true };
};

/**
 * Resolve one JS/TS module specifier written in `importer`.
 * Returns { target } | { unresolved: reason } | { external: true }.
 */
const resolveJsSpecifier = (importer, spec, ctx, state) => {
    const clean = spec.split("?")[0].split("#")[0];
    if (!clean || /^[a-z][\w+.-]*:/i.test(clean) || clean.startsWith("//")) return { external: true }; // node:fs, https://

    if (clean.startsWith("./") || clean.startsWith("../") || clean === "." || clean === "..") {
        const base = joinRel(posixDir(importer), clean);
        const target = resolveFromBase(base, importer, ctx);
        if (target) return { target };
        const reason = classifyMissing(base, importer, ctx);
        return reason === "asset" ? { external: true, asset: true } : { unresolved: reason };
    }

    if (clean.startsWith("/")) {
        // Root-relative (Vite/HTML style): try project root, then public/.
        for (const base of [joinRel(clean.slice(1)), joinRel("public", clean.slice(1))]) {
            const target = resolveFromBase(base, importer, ctx);
            if (target) return { target };
        }
        const reason = classifyMissing(joinRel(clean.slice(1)), importer, ctx);
        return reason === "asset" ? { external: true, asset: true } : { unresolved: reason };
    }

    const alias = resolveAlias(importer, clean, state, ctx);
    if (alias.target) return { target: alias.target };

    const workspace = resolveWorkspacePackage(importer, clean, state, ctx);
    if (workspace.target) return { target: workspace.target };

    if (alias.matched || workspace.matched) return { unresolved: "not-found" };
    return { external: true }; // npm package such as "react"
};

const prepare = (ctx) => ({
    aliasConfigs: loadAliasConfigs(ctx),
    packages: loadWorkspacePackages(ctx)
});

const analyze = (file, ctx, state, result) => {
    const content = ctx.read(file);
    for (const dep of extractFromFile(file, content)) {
        const resolved = resolveJsSpecifier(file, dep.specifier, ctx, state);
        result.add(dep, resolved);
    }
};

module.exports = {
    name: "javascript",
    languages: ["JavaScript", "TypeScript", "Vue", "Svelte"],
    prepare,
    analyze,
    // reused by the HTML analyzer
    extractJsSpecifiers,
    extractScriptBlocks,
    resolveJsSpecifier,
    hasTypeScriptParser: () => ts !== null
};

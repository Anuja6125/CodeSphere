// HTML / CSS (and Sass/Less) dependency detection.
//
// HTML: <script src>, <link href>, and <script> bodies (JS imports).
// CSS:  @import and url() that point at other stylesheets in the project.
// Remote URLs and non-code assets are treated as external, not unresolved.
const path = require("path");
const { joinRel, matchAll, posixDir, stripCode } = require("./common");
const { extractJsSpecifiers, extractScriptBlocks } = require("./javascript");

const STYLE_EXTS = new Set([".css", ".scss", ".sass", ".less"]);

const resolveLocal = (importer, spec, ctx) => {
    const clean = (spec || "").trim().split("?")[0].split("#")[0];
    if (!clean || /^(https?:|data:|javascript:)/i.test(clean) || clean.startsWith("//")) {
        return { external: true };
    }
    let base;
    if (clean.startsWith("/")) base = joinRel(clean.slice(1));
    else base = joinRel(posixDir(importer), clean);
    if (base === null) return { unresolved: "outside-project" };
    const found = ctx.lookup(base);
    if (found) return { target: found };
    if (ctx.existsOnDisk(base)) {
        return ctx.isSupported(base) ? { unresolved: "excluded" } : { external: true, asset: true };
    }
    return { unresolved: "not-found" };
};

const analyzeHtml = (file, ctx, result) => {
    const content = ctx.read(file);

    for (const m of matchAll(/<(?:script|link)\b([^>]*?)\/?>/gi, content)) {
        const attrs = m[1];
        const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
        const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
        const spec = src || href;
        if (!spec) continue;
        const dep = { specifier: spec, kind: src ? "script-src" : "link-href", line: content.slice(0, m.index).split("\n").length };
        result.add(dep, resolveLocal(file, spec, ctx));
    }

    for (const block of extractScriptBlocks(content)) {
        if (block.src) continue;
        const virtual = `${file}.js`;
        for (const dep of extractJsSpecifiers(block.code, virtual)) {
            const spec = dep.specifier || "";
            if (spec.startsWith(".") || spec.startsWith("/")) {
                result.add(dep, resolveLocal(file, spec, ctx));
            } else {
                result.add(dep, { external: true });
            }
        }
    }
};

const analyzeCss = (file, ctx, result) => {
    const code = stripCode(ctx.read(file), { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"] });
    const specs = [];
    for (const m of matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g, code)) {
        specs.push({ specifier: m[1], kind: "import", line: code.slice(0, m.index).split("\n").length });
    }
    for (const m of matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g, code)) {
        const spec = m[1];
        const ext = path.posix.extname(spec.split("?")[0]).toLowerCase();
        if (!STYLE_EXTS.has(ext)) continue;
        specs.push({ specifier: spec, kind: "url", line: code.slice(0, m.index).split("\n").length });
    }
    for (const dep of specs) result.add(dep, resolveLocal(file, dep.specifier, ctx));
};

const analyze = (file, ctx, _state, result) => {
    const language = ctx.languageOf(file);
    if (language === "HTML") analyzeHtml(file, ctx, result);
    else analyzeCss(file, ctx, result);
};

module.exports = {
    name: "htmlcss",
    languages: ["HTML", "CSS", "SCSS", "Less"],
    prepare: () => ({}),
    analyze
};

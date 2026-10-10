// Lightweight links from project config files to the source they name.
const path = require("path");
const { joinRel } = require("./common");

const lookupSource = (rel, ctx) => {
    if (!rel) return null;
    const base = joinRel(rel.replace(/^\.\//, ""));
    if (base === null) return null;
    return ctx.lookup(base) || ctx.lookup(`${base}.js`) || ctx.lookup(`${base}.ts`) || ctx.lookup(`${base}/index.js`) || ctx.lookup(`${base}/index.ts`);
};

const analyzePackageJson = (file, ctx, result) => {
    let json;
    try {
        json = JSON.parse(ctx.read(file));
    } catch {
        return;
    }
    for (const field of ["main", "module", "types", "typings", "browser"]) {
        const value = typeof json[field] === "string" ? json[field] : null;
        if (!value) continue;
        const target = lookupSource(value, ctx);
        if (target) result.add({ specifier: value, kind: "package-entry", line: 1 }, { target });
    }
};

const analyze = (file, ctx, _state, result) => {
    const name = path.posix.basename(file).toLowerCase();
    if (name === "package.json") analyzePackageJson(file, ctx, result);
};

module.exports = {
    name: "config",
    languages: ["JSON"],
    prepare: () => ({}),
    analyze
};

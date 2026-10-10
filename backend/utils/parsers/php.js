// PHP dependency detection.
//
// Parsing: include/require[_once] with string literals (and `__DIR__ . "x"`),
// plus `use A\B\C` / grouped `use A\{B, C}`. Resolution:
//   * include paths are joined from the including file (or project root)
//   * `use` names are mapped through composer.json PSR-4/PSR-0 autoload
//     and, as a fallback, a namespace+class index of scanned PHP files
const path = require("path");
const { joinRel, matchAll, posixDir, stripCode } = require("./common");

const PHP_STRIP = { line: ["//", "#"], block: [["/*", "*/"]], quotes: ['"', "'"] };

const extractPhp = (content) => {
    const code = stripCode(content, PHP_STRIP);
    const includes = [];
    const uses = [];

    for (const m of matchAll(/\b(?:require|include)(?:_once)?\s*(?:\(?\s*)(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]/g, code)) {
        includes.push({ specifier: m[1], line: code.slice(0, m.index).split("\n").length, kind: "include" });
    }

    const nsMatch = code.match(/\bnamespace\s+([\w\\]+)\s*[;{]/);
    const ns = nsMatch ? nsMatch[1].replace(/\\+$/, "") : "";

    for (const m of matchAll(/^[ \t]*use\s+(function\s+|const\s+)?([\w\\]+)(?:\s+as\s+\w+)?\s*;/gm, code)) {
        uses.push({ specifier: m[2].replace(/^\\/, ""), line: code.slice(0, m.index).split("\n").length });
    }
    for (const m of matchAll(/^[ \t]*use\s+([\w\\]+)\\\{([^}]+)\}/gm, code)) {
        const prefix = m[1];
        for (const part of m[2].split(",")) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name) uses.push({ specifier: `${prefix}\\${name}`.replace(/^\\/, ""), line: code.slice(0, m.index).split("\n").length });
        }
    }

    const types = new Set();
    for (const m of matchAll(/\b(?:class|interface|trait|enum)\s+(\w+)/g, code)) types.add(m[1]);

    return { ns, includes, uses, types };
};

const prepare = (ctx) => {
    const fqn = new Map();
    const psr4 = [];

    for (const file of ctx.files) {
        if (path.posix.basename(file).toLowerCase() === "composer.json") {
            try {
                const json = JSON.parse(ctx.read(file));
                const dir = posixDir(file);
                for (const key of ["autoload", "autoload-dev"]) {
                    const maps = (json[key] && json[key]["psr-4"]) || {};
                    for (const [prefix, dirs] of Object.entries(maps)) {
                        const list = Array.isArray(dirs) ? dirs : [dirs];
                        for (const rel of list) {
                            if (typeof rel !== "string") continue;
                            psr4.push({
                                prefix: prefix.replace(/\\+$/, ""),
                                dir: joinRel(dir, rel) || ""
                            });
                        }
                    }
                }
            } catch {
                // invalid composer.json
            }
        }
        if (ctx.languageOf(file) !== "PHP") continue;
        const info = extractPhp(ctx.read(file));
        for (const type of info.types) {
            const key = info.ns ? `${info.ns}\\${type}` : type;
            if (!fqn.has(key)) fqn.set(key, file);
        }
    }

    return { fqn, psr4 };
};

const resolveInclude = (file, spec, ctx) => {
    const cleaned = spec.replace(/\\/g, "/").replace(/^\.\//, "");
    const candidates = [
        joinRel(posixDir(file), cleaned),
        joinRel(cleaned)
    ];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const found = ctx.lookup(candidate) || ctx.lookup(`${candidate}.php`);
        if (found) return found;
    }
    return null;
};

const resolveUse = (name, ctx, state) => {
    if (state.fqn.has(name)) return state.fqn.get(name);
    for (const map of state.psr4) {
        if (name === map.prefix || name.startsWith(`${map.prefix}\\`)) {
            const rest = name.slice(map.prefix.length).replace(/^\\/, "").replace(/\\/g, "/");
            const base = joinRel(map.dir, rest);
            const found = ctx.lookup(`${base}.php`) || ctx.lookup(base);
            if (found) return found;
        }
    }
    return null;
};

const analyze = (file, ctx, state, result) => {
    const info = extractPhp(ctx.read(file));

    for (const inc of info.includes) {
        const dep = { specifier: inc.specifier, kind: inc.kind, line: inc.line };
        const target = resolveInclude(file, inc.specifier, ctx);
        if (target) result.add(dep, { target });
        else result.add(dep, { unresolved: "not-found" });
    }

    for (const use of info.uses) {
        const dep = { specifier: use.specifier, kind: "use", line: use.line };
        const target = resolveUse(use.specifier, ctx, state);
        if (target) {
            result.add(dep, { target });
            continue;
        }
        const root = use.specifier.split("\\")[0];
        const projectHasRoot = [...state.fqn.keys()].some((k) => k === root || k.startsWith(`${root}\\`))
            || state.psr4.some((m) => m.prefix === root || m.prefix.startsWith(`${root}\\`));
        result.add(dep, projectHasRoot ? { unresolved: "not-found" } : { external: true });
    }
};

module.exports = {
    name: "php",
    languages: ["PHP"],
    prepare,
    analyze
};

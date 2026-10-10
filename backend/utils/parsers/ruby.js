// Ruby dependency detection.
//
// Parsing: `require_relative`, `require`, `load`, and `autoload` with string
// literals. Resolution:
//   * require_relative  -> file directory, adding .rb when omitted
//   * require / load    -> project root, lib/, app/, and the requiring file's
//                         directory (Bundler-style load paths)
// Bare gem names (no matching project file) are external.
const { joinRel, matchAll, posixDir, stripCode } = require("./common");

const RUBY_STRIP = { line: ["#"], quotes: ['"', "'"] };

const extractRubyRequires = (content) => {
    const code = stripCode(content, RUBY_STRIP);
    const found = [];
    const patterns = [
        [/\brequire_relative\s*\(?\s*['"]([^'"]+)['"]/g, "require_relative"],
        [/\brequire\s*\(?\s*['"]([^'"]+)['"]/g, "require"],
        [/\bload\s*\(?\s*['"]([^'"]+)['"]/g, "load"],
        [/\bautoload\s*\(?\s*:?\w+\s*,\s*['"]([^'"]+)['"]/g, "autoload"]
    ];
    for (const [pattern, kind] of patterns) {
        for (const m of matchAll(pattern, code)) {
            found.push({ specifier: m[1], kind, line: code.slice(0, m.index).split("\n").length });
        }
    }
    return found;
};

const rubyCandidates = (base) => {
    if (!base) return [];
    if (/\.(rb|rake)$/i.test(base)) return [base];
    return [base, `${base}.rb`, `${base}.rake`];
};

const resolveRuby = (file, spec, kind, ctx) => {
    const cleaned = spec.replace(/\\/g, "/");
    const dirs = kind === "require_relative"
        ? [posixDir(file)]
        : [posixDir(file), "", "lib", "app", "src"];

    for (const dir of dirs) {
        const base = joinRel(dir, cleaned);
        for (const candidate of rubyCandidates(base)) {
            const found = ctx.lookup(candidate);
            if (found) return found;
        }
    }
    return null;
};

const analyze = (file, ctx, _state, result) => {
    for (const dep of extractRubyRequires(ctx.read(file))) {
        const target = resolveRuby(file, dep.specifier, dep.kind, ctx);
        if (target) {
            result.add(dep, { target });
        } else if (dep.kind === "require_relative" || dep.specifier.startsWith("./") || dep.specifier.startsWith("../")) {
            result.add(dep, { unresolved: "not-found" });
        } else if (ctx.lookup(`${dep.specifier}.rb`) === null && !dep.specifier.includes("/")) {
            result.add(dep, { external: true }); // likely a gem
        } else {
            result.add(dep, { unresolved: "not-found" });
        }
    }
};

module.exports = {
    name: "ruby",
    languages: ["Ruby"],
    prepare: () => ({}),
    analyze,
    extractRubyRequires
};

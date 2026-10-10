// C / C++ / Objective-C dependency detection.
//
// Parsing: comments are removed (string-aware), then preprocessor lines
// `#include "x.h"`, `#include <x/y.h>`, `#import ...` are read.
// Resolution mimics a compiler include search:
//   "x.h"  -> directory of the including file, then project include roots
//             (include/, inc/, src/, lib/, project root and their parents);
//   <x.h>  -> project include roots only.
// If that fails, a path-suffix match across the project is used (closest
// directory wins). Unmatched "quoted" includes are reported as unresolved;
// unmatched <angle> includes are treated as system/third-party headers.
const { C_STYLE, joinRel, matchAll, posixDir, stripCode } = require("./common");

const C_LANGUAGES = ["C", "C++", "Objective-C"];
const ROOT_NAMES = new Set(["include", "inc", "includes", "src", "source", "lib", "public", "headers"]);

const prepare = (ctx) => {
    const bySuffix = new Map(); // lowercase basename -> files
    const roots = new Set([""]);
    for (const file of ctx.files) {
        if (!C_LANGUAGES.includes(ctx.languageOf(file))) continue;
        const base = file.split("/").pop().toLowerCase();
        if (!bySuffix.has(base)) bySuffix.set(base, []);
        bySuffix.get(base).push(file);

        // Every folder named include/src/... (at any depth) is a likely -I path.
        const parts = file.split("/").slice(0, -1);
        for (let i = 0; i < parts.length; i++) {
            if (ROOT_NAMES.has(parts[i].toLowerCase())) {
                roots.add(parts.slice(0, i + 1).join("/"));
                roots.add(parts.slice(0, i).join("/"));
            }
        }
    }
    return { bySuffix, roots: [...roots] };
};

const commonPrefixLength = (a, b) => {
    const pa = a.split("/");
    const pb = b.split("/");
    let i = 0;
    while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
    return i;
};

const resolveInclude = (file, spec, quoted, ctx, state) => {
    const normalized = spec.replace(/\\/g, "/").trim();
    const candidates = [];
    if (quoted) candidates.push(joinRel(posixDir(file), normalized));
    for (const root of state.roots) candidates.push(joinRel(root, normalized));

    for (const candidate of candidates) {
        if (candidate === null) continue;
        const found = ctx.lookup(candidate);
        if (found) return found;
    }

    // Path-suffix match: "net/socket.h" matches "libs/core/net/socket.h".
    const base = normalized.split("/").pop().toLowerCase();
    const suffix = `/${normalized.toLowerCase()}`;
    const matches = (state.bySuffix.get(base) || []).filter((f) => `/${f.toLowerCase()}`.endsWith(suffix));
    if (matches.length === 0) return null;
    return matches.sort((a, b) => commonPrefixLength(b, file) - commonPrefixLength(a, file))[0];
};

const analyze = (file, ctx, state, result) => {
    const code = stripCode(ctx.read(file), C_STYLE);
    for (const m of matchAll(/^[ \t]*#[ \t]*(include|include_next|import)[ \t]*([<"])([^>"\n]+)[>"]/gm, code)) {
        const quoted = m[2] === '"';
        const dep = { specifier: m[3].trim(), kind: "include", line: code.slice(0, m.index).split("\n").length };
        const target = resolveInclude(file, m[3], quoted, ctx, state);
        if (target) result.add(dep, { target });
        else if (quoted) result.add(dep, { unresolved: "not-found" });
        else result.add(dep, { external: true }); // <stdio.h>, <vector>, <boost/...>
    }
};

module.exports = {
    name: "cfamily",
    languages: C_LANGUAGES,
    prepare,
    analyze
};

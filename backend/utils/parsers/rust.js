// Rust dependency detection (mod / crate / super / relative paths).
//
// `mod foo;` looks for foo.rs or foo/mod.rs next to the file (or in a
// same-named subdirectory for nested mods). `use crate::a::b` walks from
// src/lib.rs or src/main.rs. External crates (`use serde::...`) stay external.
const { joinRel, matchAll, posixDir, stripCode } = require("./common");

const strip = (content) => stripCode(content, { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"] });

const rustFile = (base, ctx) =>
    ctx.lookup(`${base}.rs`) || ctx.lookup(`${base}/mod.rs`) || null;

const crateRoot = (file, ctx) => {
    if (ctx.has("src/lib.rs")) return "src";
    if (ctx.has("src/main.rs")) return "src";
    if (ctx.has("lib.rs")) return "";
    if (ctx.has("main.rs")) return "";
    return posixDir(file);
};

const analyze = (file, ctx, _state, result) => {
    const code = strip(ctx.read(file));

    for (const m of matchAll(/\b(?:pub\s+)?mod\s+(\w+)\s*;/g, code)) {
        const name = m[1];
        const dep = { specifier: name, kind: "mod", line: code.slice(0, m.index).split("\n").length };
        const target = rustFile(joinRel(posixDir(file), name), ctx);
        if (target) result.add(dep, { target });
        else result.add(dep, { unresolved: "not-found" });
    }

    for (const m of matchAll(/\buse\s+(crate|super|self)(?:::([\w:]+)(?:::\*)?)?/g, code)) {
        const root = m[1];
        const rest = (m[2] || "").split("::").filter(Boolean);
        const dep = { specifier: [root, ...rest].join("::"), kind: "use", line: code.slice(0, m.index).split("\n").length };
        let dir;
        if (root === "crate") dir = crateRoot(file, ctx);
        else if (root === "self") dir = posixDir(file);
        else if (/\/mod\.rs$/i.test(file) || /\/(?:lib|main)\.rs$/i.test(file)) {
            dir = posixDir(posixDir(file));
        } else {
            dir = posixDir(file);
        }
        if (rest.length === 0) {
            const target = rustFile(dir, ctx) || ctx.lookup(`${dir}/mod.rs`) || ctx.lookup(`${dir}.rs`);
            if (target) result.add(dep, { target });
            continue;
        }
        let current = dir;
        let target = null;
        for (const part of rest) {
            target = rustFile(joinRel(current, part), ctx);
            current = joinRel(current, part);
            if (!target && current === null) break;
        }
        if (target) result.add(dep, { target });
        else result.add(dep, { unresolved: "not-found" });
    }
};

module.exports = {
    name: "rust",
    languages: ["Rust"],
    prepare: () => ({}),
    analyze
};

// C# dependency detection.
//
// C# has no file-level imports: `using X.Y;` brings a whole namespace into
// scope, and classes of the file's own (and enclosing) namespaces are visible
// without any using. So the analyzer:
//   1. indexes every type declared in the project with its namespace
//      (block-scoped `namespace A.B { }` and file-scoped `namespace A.B;`);
//   2. computes each file's visible namespaces: own + enclosing namespaces,
//      `using` directives and project-wide `global using` directives;
//   3. links the file to every project file declaring a type that is visible
//      and referenced by simple name (comments/strings blanked first).
// `using Alias = A.B.Type;` and `using static A.B.Type;` link directly.
// `using` namespaces sharing the project's root namespace that no file
// declares are reported unresolved; System.*, Microsoft.*, ... are external.
const { C_STYLE, identifierSet, matchAll, stripCode } = require("./common");

const strip = (content) =>
    stripCode(content, { ...C_STYLE, quotes: ['"', "'"], blankStrings: true });

const parseFile = (content) => {
    const code = strip(content);
    const namespaces = matchAll(/\bnamespace\s+([\w.]+)\s*[{;]/g, code).map((m) => m[1]);

    const types = new Set();
    for (const m of matchAll(/\b(?:class|interface|struct|enum|record(?:\s+(?:class|struct))?)\s+([A-Za-z_]\w*)/g, code)) {
        types.add(m[1]);
    }
    for (const m of matchAll(/\bdelegate\s+[\w<>,.?\s[\]]+?\s+([A-Za-z_]\w*)\s*[<(]/g, code)) {
        types.add(m[1]);
    }

    const usings = [];
    for (const m of matchAll(/^[ \t]*(global[ \t]+)?using[ \t]+(static[ \t]+)?(?:([A-Za-z_]\w*)[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm, code)) {
        usings.push({
            isGlobal: !!m[1],
            isStatic: !!m[2],
            alias: m[3] || null,
            name: m[4],
            line: code.slice(0, m.index).split("\n").length
        });
    }
    return { namespaces, types, usings, identifiers: identifierSet(code) };
};

/** "A.B.C" -> ["A.B.C", "A.B", "A"] */
const withParents = (ns) => {
    const parts = ns.split(".");
    const list = [];
    for (let i = parts.length; i >= 1; i--) list.push(parts.slice(0, i).join("."));
    return list;
};

const prepare = (ctx) => {
    const fileInfo = new Map();
    const typeIndex = new Map(); // simple type name -> [{ file, ns }]
    const fqn = new Map(); // A.B.Type -> file
    const declaredNamespaces = new Set();
    const globalUsings = [];

    for (const file of ctx.files) {
        if (ctx.languageOf(file) !== "C#") continue;
        const info = parseFile(ctx.read(file));
        fileInfo.set(file, info);
        const ns = info.namespaces[0] || "";
        for (const n of info.namespaces) withParents(n).forEach((p) => declaredNamespaces.add(p));
        for (const type of info.types) {
            if (!typeIndex.has(type)) typeIndex.set(type, []);
            typeIndex.get(type).push({ file, ns });
            fqn.set(ns ? `${ns}.${type}` : type, file);
        }
        for (const u of info.usings) if (u.isGlobal && !u.alias && !u.isStatic) globalUsings.push(u.name);
    }

    const rootNamespaces = new Set([...declaredNamespaces].map((n) => n.split(".")[0]));
    return { fileInfo, typeIndex, fqn, declaredNamespaces, rootNamespaces, globalUsings };
};

const analyze = (file, ctx, state, result) => {
    const info = state.fileInfo.get(file);
    if (!info) return;

    const visible = new Set([""]);
    for (const ns of info.namespaces) withParents(ns).forEach((p) => visible.add(p));
    for (const ns of state.globalUsings) visible.add(ns);

    for (const u of info.usings) {
        const dep = { specifier: u.name, kind: u.isStatic ? "using-static" : "using", line: u.line };
        if (u.alias || u.isStatic) {
            const target = state.fqn.get(u.name);
            if (target) result.add(dep, { target });
            else if (state.declaredNamespaces.has(u.name)) visible.add(u.name);
            else if (state.rootNamespaces.has(u.name.split(".")[0])) result.add(dep, { unresolved: "not-found" });
            else result.add(dep, { external: true });
            continue;
        }
        if (state.declaredNamespaces.has(u.name)) {
            visible.add(u.name); // edges come from the type references below
        } else if (state.rootNamespaces.has(u.name.split(".")[0])) {
            result.add(dep, { unresolved: "not-found" });
        } else {
            result.add(dep, { external: true });
        }
    }

    // Type references: visible project types used by simple name.
    for (const identifier of info.identifiers) {
        if (info.types.has(identifier)) continue;
        const declarations = state.typeIndex.get(identifier);
        if (!declarations) continue;
        for (const decl of declarations) {
            if (decl.file === file || !visible.has(decl.ns)) continue;
            result.add(
                { specifier: decl.ns ? `${decl.ns}.${identifier}` : identifier, kind: "type-reference" },
                { target: decl.file }
            );
        }
    }
};

module.exports = {
    name: "csharp",
    languages: ["C#"],
    prepare,
    analyze
};

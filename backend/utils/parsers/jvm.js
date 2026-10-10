// Java / Kotlin / Scala / Groovy dependency detection.
//
// Parsing: comments and strings are blanked, then `package` declarations,
// `import [static] a.b.C[.*] [as X]` statements and top-level type/function
// declarations are read. A fully-qualified-name index (package + declared type
// names) maps imports to files. Two further relationships are detected:
//   * wildcard imports (a.b.*): edges to classes of that package that the file
//     actually references by simple name;
//   * same-package references: JVM code uses classes of its own package without
//     importing them, so simple-name references to those classes become edges.
// Imports whose package root is not declared anywhere in the project
// (java.util, org.springframework, ...) are external.
const { C_STYLE, identifierSet, matchAll, stripCode } = require("./common");

const JVM_LANGUAGES = ["Java", "Kotlin", "Scala", "Groovy"];

const strip = (content) => stripCode(content, { ...C_STYLE, quotes: ['"', "'"], triple: true, blankStrings: true });

const parseFile = (content, language) => {
    const code = strip(content);
    const pkgMatch = code.match(/^\s*package\s+([\w.]+)/m);
    const pkg = pkgMatch ? pkgMatch[1] : "";

    const types = new Set();
    for (const m of matchAll(/\b(?:class|interface|enum|record|object|trait|typealias|@interface)\s+([A-Z_$][\w$]*)/g, code)) {
        types.add(m[1]);
    }

    // Kotlin/Scala top-level functions and properties (importable by name).
    const members = new Set();
    if (language !== "Java") {
        for (const m of matchAll(/^(?:[ \t]*(?:public|internal|private|inline|suspend|operator|infix|tailrec|external|const|override|open|final|lateinit|implicit)\s+)*(?:fun|val|var|def)\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)/gm, code)) {
            members.add(m[1]);
        }
    }

    const imports = [];
    for (const m of matchAll(/^[ \t]*import\s+(static\s+)?([\w.]+?)(\.\*|\._)?(?:\s+as\s+\w+)?\s*;?[ \t]*$/gm, code)) {
        imports.push({
            name: m[2],
            wildcard: !!m[3],
            isStatic: !!m[1],
            line: code.slice(0, m.index).split("\n").length
        });
    }
    // Scala/Kotlin grouped imports: import a.b.{C, D}
    for (const m of matchAll(/^[ \t]*import\s+([\w.]+)\.\{([^}]*)\}/gm, code)) {
        for (const part of m[2].split(",")) {
            const name = part.trim().split(/\s*=>\s*|\s+as\s+/)[0].trim();
            if (/^\w+$/.test(name)) {
                imports.push({ name: `${m[1]}.${name}`, wildcard: false, isStatic: false, line: code.slice(0, m.index).split("\n").length });
            } else if (name === "_") {
                imports.push({ name: m[1], wildcard: true, isStatic: false, line: code.slice(0, m.index).split("\n").length });
            }
        }
    }

    const importedNames = new Set(imports.filter((i) => !i.wildcard).map((i) => i.name.split(".").pop()));
    return { pkg, types, members, imports, importedNames, identifiers: identifierSet(code) };
};

const prepare = (ctx) => {
    const fileInfo = new Map();
    const fqn = new Map(); // a.b.Type -> file
    const packages = new Map(); // a.b -> [files]
    const packageRoots = new Set();

    for (const file of ctx.files) {
        const language = ctx.languageOf(file);
        if (!JVM_LANGUAGES.includes(language)) continue;
        const info = parseFile(ctx.read(file), language);
        fileInfo.set(file, info);

        // Java: the public type is named after the file, even if regex missed it.
        const stem = file.split("/").pop().replace(/\.\w+$/, "");
        if (language === "Java" && /^[A-Z]/.test(stem)) info.types.add(stem);

        for (const type of info.types) {
            const key = info.pkg ? `${info.pkg}.${type}` : type;
            if (!fqn.has(key)) fqn.set(key, file);
        }
        if (!packages.has(info.pkg)) packages.set(info.pkg, []);
        packages.get(info.pkg).push(file);
        if (info.pkg) packageRoots.add(info.pkg.split(".").slice(0, 2).join("."));
    }
    return { fileInfo, fqn, packages, packageRoots };
};

const isProjectPackage = (name, state) => {
    const root2 = name.split(".").slice(0, 2).join(".");
    return state.packageRoots.has(root2);
};

const analyze = (file, ctx, state, result) => {
    const info = state.fileInfo.get(file);
    if (!info) return;

    for (const imp of info.imports) {
        const dep = { specifier: imp.wildcard ? `${imp.name}.*` : imp.name, kind: imp.isStatic ? "static-import" : "import", line: imp.line };

        if (imp.wildcard) {
            // a.b.* : a package (or, for static imports, a class).
            const asClass = state.fqn.get(imp.name);
            if (asClass) {
                result.add(dep, { target: asClass });
                continue;
            }
            const members = state.packages.get(imp.name);
            if (members) {
                const used = members.filter((other) => {
                    const otherInfo = state.fileInfo.get(other);
                    return [...otherInfo.types].some((t) => info.identifiers.has(t));
                });
                // Only link the classes the file actually uses.
                for (const target of used) result.add(dep, { target });
                continue;
            }
            result.add(dep, isProjectPackage(imp.name, state) ? { unresolved: "not-found" } : { external: true });
            continue;
        }

        // a.b.C, a.b.C.Inner, a.b.C.staticMember: try the longest prefix that is a known type.
        const parts = imp.name.split(".");
        let target = null;
        for (let len = parts.length; len >= 1 && !target; len--) {
            target = state.fqn.get(parts.slice(0, len).join(".")) || null;
        }
        // Kotlin/Scala: import a.b.topLevelFunction
        if (!target && parts.length > 1) {
            const pkg = parts.slice(0, -1).join(".");
            const member = parts[parts.length - 1];
            const candidates = state.packages.get(pkg) || [];
            target = candidates.find((other) => state.fileInfo.get(other).members.has(member)) || null;
        }
        if (target) result.add(dep, { target });
        else result.add(dep, isProjectPackage(imp.name, state) ? { unresolved: "not-found" } : { external: true });
    }

    // Same-package references (no import needed on the JVM).
    const dirOf = (f) => f.slice(0, f.lastIndexOf("/") + 1);
    for (const other of state.packages.get(info.pkg) || []) {
        if (other === file) continue;
        // Files without a package declaration only share a package within one folder.
        if (!info.pkg && dirOf(other) !== dirOf(file)) continue;
        const otherInfo = state.fileInfo.get(other);
        const usedType = [...otherInfo.types].find((t) => info.identifiers.has(t) && !info.types.has(t) && !info.importedNames.has(t));
        if (usedType) {
            result.add({ specifier: info.pkg ? `${info.pkg}.${usedType}` : usedType, kind: "same-package" }, { target: other });
        }
    }
};

module.exports = {
    name: "jvm",
    languages: JVM_LANGUAGES,
    prepare,
    analyze
};

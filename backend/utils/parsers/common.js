// Shared helpers for the language parsers.
const path = require("path");

/**
 * Remove comments from source code without being fooled by comment markers
 * inside string literals. Newlines are preserved so line structure (and any
 * line-anchored regex) still works. Optionally blanks string contents too, so
 * identifier scans do not match words inside strings.
 *
 * options:
 *   line:      line comment markers, e.g. ["//"] or ["#"]
 *   block:     block comment pairs, e.g. [["/*", "*\/"]]
 *   quotes:    string delimiters, e.g. ['"', "'", "`"]
 *   triple:    support Python triple-quoted strings
 *   rawQuotes: delimiters with no escape sequences (Go backticks)
 *   blankStrings: replace string contents with spaces
 */
const stripCode = (code, options) => {
    const line = options.line || [];
    const block = options.block || [];
    const quotes = options.quotes || [];
    const rawQuotes = options.rawQuotes || [];
    const triple = !!options.triple;
    const blankStrings = !!options.blankStrings;

    let out = "";
    let i = 0;
    const n = code.length;

    const blank = (text) => text.replace(/[^\n]/g, " ");

    while (i < n) {
        const ch = code[i];

        // Block comments
        let matchedBlock = null;
        for (const [open, close] of block) {
            if (code.startsWith(open, i)) { matchedBlock = [open, close]; break; }
        }
        if (matchedBlock) {
            const end = code.indexOf(matchedBlock[1], i + matchedBlock[0].length);
            const stop = end === -1 ? n : end + matchedBlock[1].length;
            out += blank(code.slice(i, stop));
            i = stop;
            continue;
        }

        // Line comments
        let matchedLine = false;
        for (const marker of line) {
            if (code.startsWith(marker, i)) { matchedLine = true; break; }
        }
        if (matchedLine) {
            const end = code.indexOf("\n", i);
            const stop = end === -1 ? n : end;
            out += blank(code.slice(i, stop));
            i = stop;
            continue;
        }

        // Python triple-quoted strings
        if (triple && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
            const delim = code.slice(i, i + 3);
            let j = i + 3;
            while (j < n && !code.startsWith(delim, j)) {
                j += code[j] === "\\" ? 2 : 1;
            }
            const stop = Math.min(n, j + 3);
            out += blankStrings ? delim + blank(code.slice(i + 3, j)) + (j < n ? delim : "") : code.slice(i, stop);
            i = stop;
            continue;
        }

        // Ordinary strings
        if (quotes.includes(ch) || rawQuotes.includes(ch)) {
            const raw = rawQuotes.includes(ch);
            let j = i + 1;
            while (j < n && code[j] !== ch) {
                if (!raw && code[j] === "\\") { j += 2; continue; }
                // Single-line strings cannot span lines (except template/raw strings).
                if (code[j] === "\n" && ch !== "`" && !raw) break;
                j++;
            }
            const stop = Math.min(n, j + 1);
            out += blankStrings ? ch + blank(code.slice(i + 1, j)) + (code[j] === ch ? ch : "") : code.slice(i, stop);
            i = stop;
            continue;
        }

        out += ch;
        i++;
    }

    return out;
};

const C_STYLE = { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"] };

/** 1-based line number of a character offset. */
const lineAt = (text, index) => {
    let count = 1;
    for (let i = 0; i < index && i < text.length; i++) {
        if (text.charCodeAt(i) === 10) count++;
    }
    return count;
};

/** Collect all regex matches (pattern must have the g flag). */
const matchAll = (pattern, text) => {
    const results = [];
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        results.push(m);
        if (m[0].length === 0) pattern.lastIndex++;
    }
    return results;
};

/** Set of identifiers in code (comments/strings should already be blanked). */
const identifierSet = (code, { skipMemberAccess = false } = {}) => {
    const set = new Set();
    const re = /[A-Za-z_$][\w$]*/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        if (skipMemberAccess && m.index > 0 && code[m.index - 1] === ".") continue;
        set.add(m[0]);
    }
    return set;
};

const posixDir = (file) => {
    const dir = path.posix.dirname(file);
    return dir === "." ? "" : dir;
};

/** Join + normalize project-relative posix paths. Returns null if the path escapes the project. */
const joinRel = (...parts) => {
    const joined = path.posix.normalize(path.posix.join(...parts.map((p) => p || ".")));
    if (joined === ".." || joined.startsWith("../") || path.posix.isAbsolute(joined)) return null;
    return joined === "." ? "" : joined.replace(/\/$/, "");
};

/** All ancestor directories of a file, nearest first, ending with "" (project root). */
const ancestorDirs = (file) => {
    const dirs = [];
    let dir = posixDir(file);
    while (dir) {
        dirs.push(dir);
        dir = posixDir(dir);
    }
    dirs.push("");
    return dirs;
};

module.exports = {
    C_STYLE,
    ancestorDirs,
    identifierSet,
    joinRel,
    lineAt,
    matchAll,
    posixDir,
    stripCode
};

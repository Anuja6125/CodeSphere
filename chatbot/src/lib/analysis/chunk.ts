import { GeneratedChunk, ChunkType } from "./types";
import { usesAstParsing } from "./language";

const FALLBACK_MAX_LINES = 80;

function lineNumberAt(content: string, index: number): number {
  if (index <= 0) return 1;
  let lines = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === "\n") lines++;
  }
  return lines;
}

function sliceByLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split("\n");
  return lines.slice(Math.max(0, startLine - 1), endLine).join("\n");
}

function findBlockEnd(content: string, openBraceIndex: number): number {
  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBraceIndex; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "\\" ) {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return content.length - 1;
}

interface JsMatch {
  kind: ChunkType;
  name: string;
  isExported: boolean;
  start: number;
  brace: number;
}

function collectJsTsSymbols(content: string): JsMatch[] {
  const matches: JsMatch[] = [];
  const patterns: Array<{ kind: ChunkType; regex: RegExp }> = [
    { kind: "function", regex: /(export\s+)?(async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g },
    { kind: "class", regex: /(export\s+)?(default\s+)?class\s+(\w+)/g },
    { kind: "interface", regex: /(export\s+)?interface\s+(\w+)/g },
    { kind: "type", regex: /(export\s+)?type\s+(\w+)\s*=/g },
    { kind: "function", regex: /(export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/g },
    { kind: "function", regex: /(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?function/g },
    { kind: "component", regex: /(export\s+)?(default\s+)?function\s+([A-Z]\w*)\s*\(/g },
  ];

  for (const { kind, regex } of patterns) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const full = m[0];
      const isExported = /\bexport\b/.test(full);
      const name = m[m.length - 1];
      const brace = content.indexOf("{", m.index);
      matches.push({
        kind: kind === "function" && /^[A-Z]/.test(name) ? "component" : kind,
        name,
        isExported,
        start: m.index,
        brace: brace === -1 ? m.index + full.length : brace,
      });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  const unique: JsMatch[] = [];
  for (const match of matches) {
    if (unique.some((u) => Math.abs(u.start - match.start) < 8 && u.name === match.name)) continue;
    unique.push(match);
  }
  return unique;
}

export function chunkJsTs(content: string, language: string): GeneratedChunk[] {
  if (!content.trim()) return [];

  try {
    const symbols = collectJsTsSymbols(content);
    if (symbols.length === 0) return fallbackChunk(content, language);

    const chunks: GeneratedChunk[] = [];
    let index = 0;
    let cursor = 0;

    for (const symbol of symbols) {
      if (symbol.start > cursor) {
        const preamble = content.slice(cursor, symbol.start).trim();
        if (preamble.length > 0) {
          const startLine = lineNumberAt(content, cursor);
          const endLine = lineNumberAt(content, symbol.start);
          chunks.push({
            chunkIndex: index++,
            startLine,
            endLine,
            content: sliceByLines(content, startLine, endLine).trimEnd(),
            language,
            chunkType: "module",
            symbolName: null,
            isExported: false,
            parentSymbol: null,
          });
        }
      }

      let endIndex: number;
      if (symbol.kind === "type") {
        const semi = content.indexOf(";", symbol.start);
        const nl = content.indexOf("\n\n", symbol.start);
        endIndex = semi !== -1 ? semi : nl !== -1 ? nl : Math.min(content.length - 1, symbol.start + 400);
      } else {
        endIndex = findBlockEnd(content, symbol.brace);
      }

      const startLine = lineNumberAt(content, symbol.start);
      const endLine = lineNumberAt(content, endIndex);
      chunks.push({
        chunkIndex: index++,
        startLine,
        endLine,
        content: sliceByLines(content, startLine, endLine),
        language,
        chunkType: symbol.kind,
        symbolName: symbol.name,
        isExported: symbol.isExported,
        parentSymbol: null,
      });
      cursor = endIndex + 1;
    }

    if (cursor < content.length) {
      const rest = content.slice(cursor).trim();
      if (rest.length > 0) {
        const startLine = lineNumberAt(content, cursor);
        const endLine = lineNumberAt(content, content.length);
        chunks.push({
          chunkIndex: index++,
          startLine,
          endLine,
          content: sliceByLines(content, startLine, endLine).trimEnd(),
          language,
          chunkType: "module",
          symbolName: null,
          isExported: false,
          parentSymbol: null,
        });
      }
    }

    return chunks.filter((c) => c.content.trim().length > 0);
  } catch {
    return fallbackChunk(content, language);
  }
}

export function chunkMarkdown(content: string, language: string | null): GeneratedChunk[] {
  if (!content.trim()) return [];
  const lines = content.split("\n");
  const chunks: GeneratedChunk[] = [];
  let currentStart = 1;
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  let index = 0;

  const flush = (endLine: number) => {
    const text = buffer.join("\n").trim();
    if (!text) return;
    chunks.push({
      chunkIndex: index++,
      startLine: currentStart,
      endLine,
      content: text,
      language,
      chunkType: "section",
      symbolName: currentHeading,
      isExported: false,
      parentSymbol: null,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (heading && buffer.length > 0) {
      flush(i);
      buffer = [];
      currentStart = i + 1;
      currentHeading = heading[2].trim();
    }
    if (heading && buffer.length === 0) {
      currentStart = i + 1;
      currentHeading = heading[2].trim();
    }
    buffer.push(lines[i]);
  }
  flush(lines.length);
  return chunks.length > 0 ? chunks : fallbackChunk(content, language);
}

export function fallbackChunk(content: string, language: string | null): GeneratedChunk[] {
  if (!content || !content.trim()) return [];
  const lines = content.split("\n");
  const chunks: GeneratedChunk[] = [];
  for (let i = 0; i < lines.length; i += FALLBACK_MAX_LINES) {
    const startLine = i + 1;
    const endLine = Math.min(lines.length, i + FALLBACK_MAX_LINES);
    chunks.push({
      chunkIndex: chunks.length,
      startLine,
      endLine,
      content: lines.slice(i, endLine).join("\n"),
      language,
      chunkType: "fallback",
      symbolName: null,
      isExported: false,
      parentSymbol: null,
    });
  }
  return chunks;
}

export function chunkFile(content: string, language: string | null, category?: string): GeneratedChunk[] {
  if (!content || !content.trim()) return [];

  try {
    if (usesAstParsing(language)) {
      return chunkJsTs(content, language as string);
    }
    if (language === "Markdown" || category === "DOCUMENTATION") {
      return chunkMarkdown(content, language);
    }
    return fallbackChunk(content, language);
  } catch {
    return fallbackChunk(content, language);
  }
}

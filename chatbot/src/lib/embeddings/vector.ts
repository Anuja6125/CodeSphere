export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export function tokenize(text: string): string[] {
  return Array.from(new Set((text.toLowerCase().match(/[a-z_][a-z0-9_]*/g) || []).filter((token) => token.length > 1)));
}

export function lexicalScore(query: string, content: string, symbolName: string | null, filePath: string | null = null): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  
  const contentLower = content.toLowerCase();
  let exactPhraseBonus = contentLower.includes(query.toLowerCase()) ? 0.3 : 0;
  
  const haystack = `${symbolName || ""}\n${filePath || ""}\n${contentLower}`;
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  
  const symbolMatch = symbolName && tokens.some((token) => symbolName.toLowerCase().includes(token)) ? 0.2 : 0;
  const pathMatch = filePath && tokens.some((token) => filePath.toLowerCase().includes(token)) ? 0.2 : 0;
  
  return Math.min(1, (matches / tokens.length) + symbolMatch + pathMatch + exactPhraseBonus);
}

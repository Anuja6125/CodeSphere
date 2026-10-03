/** An error with an HTTP status. Controllers turn it into a JSON response. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turn library errors into one short, readable line for users. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Gemini SDK: "[GoogleGenerativeAI Error]: Error fetching from <url>: [429 Too Many Requests] <detail>"
  const gemini = text.match(/GoogleGenerativeAI Error\]:.*?\[(\d{3})[^\]]*\]\s*(.*)/s);
  if (gemini) return `AI service error (${gemini[1]}): ${gemini[2].split("\n")[0].slice(0, 200) || "request failed"}`;
  if (text.includes("GoogleGenerativeAI Error")) return "The AI service could not be reached. Try again in a minute.";

  // Prisma: "Invalid `prisma.x()` invocation:" then the real reason on a later line.
  const useful = lines[0]?.startsWith("Invalid `") && lines.length > 1 ? lines[lines.length - 1] : lines[0];
  return (useful ?? "Unknown error").slice(0, 500);
}

/** Is this a "database is down" error? (Prisma connection codes or driver connection errors.) */
export function isDatabaseDown(error: unknown): boolean {
  const e = error as { code?: string; name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === "PrismaClientInitializationError") return true;
  if (e.code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(e.code)) return true;
  return /Can't reach database server|ECONNREFUSED|Connection terminated|connect ETIMEDOUT/i.test(e.message ?? "");
}

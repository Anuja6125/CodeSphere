/** An error with an HTTP status. Controllers turn it into a JSON response. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Prisma puts blank lines first. Keep the first real line, and keep it short.
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "Unknown error";
  return line.slice(0, 500);
}

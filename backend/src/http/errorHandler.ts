import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { HttpError, errorMessage } from "../services/errors";

/** One place that turns errors into { error } JSON with the right status. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = "Something went wrong on the server.";

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "The ZIP file is too large." : err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    status = 404;
    message = "Not found.";
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    status = 503;
    message = "The database is unreachable. Check DATABASE_URL.";
  } else if (err instanceof SyntaxError && "body" in (err as object)) {
    status = 400;
    message = "Invalid JSON body.";
  } else if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
    status = (err as { status: number }).status;
    message = errorMessage(err);
  }

  if (status >= 500) console.error("[api]", err);
  res.status(status).json({ error: message });
}

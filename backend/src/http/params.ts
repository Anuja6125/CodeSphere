import type { Request } from "express";

/** The :id route param as a plain string. */
export const idParam = (req: Request): string => String(req.params.id);

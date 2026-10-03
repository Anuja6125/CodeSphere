import type { Request, Response } from "express";
import { idParam } from "../http/params";
import { db } from "../lib/db";
import { HttpError } from "../services/errors";
import { startDocumentation } from "../services/documentation";

export async function generateDocumentation(req: Request, res: Response) {
  const documentation = await startDocumentation(idParam(req));
  res.status(202).json({ documentation });
}

export async function getDocumentation(req: Request, res: Response) {
  const repo = await db.repository.findUnique({ where: { id: idParam(req) }, select: { id: true } });
  if (!repo) throw new HttpError(404, "Repository not found.");
  const documentation = await db.documentation.findUnique({ where: { repositoryId: repo.id } });
  res.json({ documentation }); // null = never generated
}

/** GET .../documentation/download — the Markdown as a file. */
export async function downloadDocumentation(req: Request, res: Response) {
  const doc = await db.documentation.findUnique({
    where: { repositoryId: idParam(req) },
    include: { repository: { select: { name: true } } },
  });
  if (!doc || doc.status !== "READY" || !doc.content) throw new HttpError(404, "No finished documentation to download.");
  const safeName = doc.repository.name.replace(/[^\w.-]+/g, "-") || "project";
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-documentation.md"`);
  res.type("text/markdown; charset=utf-8").send(doc.content);
}

import type { Request, Response } from "express";
import { idParam } from "../http/params";
import { db } from "../lib/db";
import { HttpError } from "../services/errors";
import { startDocumentation } from "../services/documentation";
import { generateDocumentationPdf } from "../services/pdf";

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

/** GET .../documentation/download — PDF documentation file (or Markdown if ?format=md). */
export async function downloadDocumentation(req: Request, res: Response) {
  const doc = await db.documentation.findUnique({
    where: { repositoryId: idParam(req) },
    include: { repository: { select: { name: true } } },
  });
  if (!doc || doc.status !== "READY" || !doc.content) throw new HttpError(404, "No finished documentation to download.");
  const safeName = doc.repository.name.replace(/[^\w.-]+/g, "-") || "project";

  const format = (req.query.format as string)?.toLowerCase();
  if (format === "md" || format === "markdown") {
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-documentation.md"`);
    res.type("text/markdown; charset=utf-8").send(doc.content);
    return;
  }

  const pdfBuffer = await generateDocumentationPdf(doc.content, {
    repoName: doc.repository.name,
    title: `${doc.repository.name} Documentation`,
    updatedAt: doc.updatedAt,
  });

  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-documentation.pdf"`);
  res.type("application/pdf").send(pdfBuffer);
}


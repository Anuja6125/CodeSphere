import type { Request, Response } from "express";
import { idParam } from "../http/params";
import { db } from "../lib/db";
import { HttpError } from "../services/errors";
import { buildFileFlow, getFileContent } from "../services/fileFlow";

/** GET /api/repositories/:id/graph */
export async function getGraph(req: Request, res: Response) {
  const repo = await db.repository.findUnique({
    where: { id: idParam(req) },
    select: { status: true, graph: true },
  });
  if (!repo) throw new HttpError(404, "Repository not found.");
  if (!repo.graph) {
    const busy = !["ANALYZED", "FAILED"].includes(repo.status);
    throw new HttpError(busy ? 409 : 404, busy ? "The graph is still being built." : "No graph for this repository. Re-analyze it.");
  }
  const { nodes, edges, stats, unresolved, whereToStart, generatedAt } = repo.graph;
  res.json({ nodes, edges, stats, unresolved, whereToStart, generatedAt });
}

/** GET /api/repositories/:id/files/content?path=src/a.ts */
export async function getFile(req: Request, res: Response) {
  res.json({ file: await getFileContent(idParam(req), String(req.query.path ?? "")) });
}

/** POST /api/repositories/:id/files/flow { path } — AI logic flowchart for one file. */
export async function getFileFlow(req: Request, res: Response) {
  const filePath = typeof req.body?.path === "string" ? req.body.path : "";
  res.json(await buildFileFlow(idParam(req), filePath));
}

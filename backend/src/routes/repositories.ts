import express, { Router } from "express";
import { asyncHandler as h } from "../http/asyncHandler";
import { fromNextHandler as next } from "../http/nextAdapter";
import { zipUpload } from "../http/upload";
import * as repo from "../controllers/repository";
import * as graph from "../controllers/graph";
import * as docs from "../controllers/documentation";
import { requireProjectAccess } from "../middleware/auth";

// Route handlers moved unchanged from the old chatbot app (RAG chat + insights).
import * as chat from "../app/api/repos/[id]/chat/route";
import * as analysis from "../app/api/repos/[id]/analysis/route";
import * as analyze from "../app/api/repos/[id]/analyze/route";
import * as architecture from "../app/api/repos/[id]/architecture/route";
import * as architectureSummary from "../app/api/repos/[id]/architecture/summary/route";
import * as health from "../app/api/repos/[id]/health/route";
import * as healthSummary from "../app/api/repos/[id]/health/summary/route";
import * as impact from "../app/api/repos/[id]/impact/route";
import * as impactAnalyze from "../app/api/repos/[id]/impact/analyze/route";
import * as search from "../app/api/repos/[id]/search/route";
import * as entrypoints from "../app/api/repos/[id]/entrypoints/route";
import * as chunks from "../app/api/repos/[id]/chunks/route";
import * as embed from "../app/api/repos/[id]/embed/route";
import * as dependencies from "../app/api/repos/[id]/dependencies/route";

const router = Router();
const json = express.json({ limit: "1mb" });

// Repository Management
router.post("/", (req, res, nextFn) => (req.is("multipart/form-data") ? zipUpload(req, res, nextFn) : json(req, res, nextFn)), h(repo.createRepository));
router.get("/", h(repo.listRepositories));
router.get("/:id", requireProjectAccess("VIEWER"), h(repo.getRepository));
router.get("/:id/history", requireProjectAccess("VIEWER"), h(repo.getProjectHistory));
router.post("/:id/reanalyze", requireProjectAccess("EDITOR"), h(repo.reanalyzeRepository));
router.delete("/:id", requireProjectAccess("MANAGER"), h(repo.deleteRepository));

// Project Sharing / Access Control
router.get("/:id/access", requireProjectAccess("VIEWER"), h(repo.listProjectAccess));
router.post("/:id/access", json, requireProjectAccess("MANAGER"), h(repo.addProjectAccess));
router.delete("/:id/access/:userId", requireProjectAccess("MANAGER"), h(repo.removeProjectAccess));

// Graph
router.get("/:id/graph", requireProjectAccess("VIEWER"), h(graph.getGraph));
router.get("/:id/files/content", requireProjectAccess("VIEWER"), h(graph.getFile));
router.post("/:id/files/flow", requireProjectAccess("VIEWER"), json, h(graph.getFileFlow));

// Documentation
router.post("/:id/documentation", requireProjectAccess("EDITOR"), h(docs.generateDocumentation));
router.get("/:id/documentation", requireProjectAccess("VIEWER"), h(docs.getDocumentation));
router.get("/:id/documentation/download", requireProjectAccess("VIEWER"), h(docs.downloadDocumentation));

// Chat (existing RAG pipeline)
router.get("/:id/chat", requireProjectAccess("VIEWER"), next(chat.GET));
router.post("/:id/chat", requireProjectAccess("VIEWER"), json, next(chat.POST));
router.delete("/:id/chat", requireProjectAccess("EDITOR"), next(chat.DELETE));

// Insights (existing chatbot features)
router.get("/:id/analysis", requireProjectAccess("VIEWER"), next(analysis.GET));
router.post("/:id/analyze", requireProjectAccess("EDITOR"), next(analyze.POST));
router.get("/:id/architecture", requireProjectAccess("VIEWER"), next(architecture.GET));
router.post("/:id/architecture/summary", requireProjectAccess("EDITOR"), json, next(architectureSummary.POST));
router.get("/:id/health", requireProjectAccess("VIEWER"), next(health.GET));
router.post("/:id/health/summary", requireProjectAccess("EDITOR"), json, next(healthSummary.POST));
router.get("/:id/impact", requireProjectAccess("VIEWER"), next(impact.GET));
router.post("/:id/impact/analyze", requireProjectAccess("EDITOR"), json, next(impactAnalyze.POST));
router.post("/:id/search", requireProjectAccess("VIEWER"), json, next(search.POST));
router.get("/:id/entrypoints", requireProjectAccess("VIEWER"), next(entrypoints.GET));
router.get("/:id/chunks", requireProjectAccess("VIEWER"), next(chunks.GET));
router.post("/:id/embed", requireProjectAccess("EDITOR"), next(embed.POST));
router.get("/:id/dependencies", requireProjectAccess("VIEWER"), next(dependencies.GET));

export default router;

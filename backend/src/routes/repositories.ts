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
router.get("/:id", requireProjectAccess(), h(repo.getRepository));
router.get("/:id/history", requireProjectAccess(), h(repo.getProjectHistory));
router.post("/:id/reanalyze", requireProjectAccess(), h(repo.reanalyzeRepository));
router.delete("/:id", requireProjectAccess(), h(repo.deleteRepository));

// Graph
router.get("/:id/graph", requireProjectAccess(), h(graph.getGraph));
router.get("/:id/files/content", requireProjectAccess(), h(graph.getFile));
router.post("/:id/files/flow", requireProjectAccess(), json, h(graph.getFileFlow));

// Documentation
router.post("/:id/documentation", requireProjectAccess(), h(docs.generateDocumentation));
router.get("/:id/documentation", requireProjectAccess(), h(docs.getDocumentation));
router.get("/:id/documentation/download", requireProjectAccess(), h(docs.downloadDocumentation));
router.get("/:id/documentation/download.pdf", requireProjectAccess(), h(docs.downloadDocumentation));


// Chat (existing RAG pipeline)
router.get("/:id/chat", requireProjectAccess(), next(chat.GET));
router.post("/:id/chat", requireProjectAccess(), json, next(chat.POST));
router.delete("/:id/chat", requireProjectAccess(), next(chat.DELETE));

// Insights (existing chatbot features)
router.get("/:id/analysis", requireProjectAccess(), next(analysis.GET));
router.post("/:id/analyze", requireProjectAccess(), next(analyze.POST));
router.get("/:id/architecture", requireProjectAccess(), next(architecture.GET));
router.post("/:id/architecture/summary", requireProjectAccess(), json, next(architectureSummary.POST));
router.get("/:id/health", requireProjectAccess(), next(health.GET));
router.post("/:id/health/summary", requireProjectAccess(), json, next(healthSummary.POST));
router.get("/:id/impact", requireProjectAccess(), next(impact.GET));
router.post("/:id/impact/analyze", requireProjectAccess(), json, next(impactAnalyze.POST));
router.post("/:id/search", requireProjectAccess(), json, next(search.POST));
router.get("/:id/entrypoints", requireProjectAccess(), next(entrypoints.GET));
router.get("/:id/chunks", requireProjectAccess(), next(chunks.GET));
router.post("/:id/embed", requireProjectAccess(), next(embed.POST));
router.get("/:id/dependencies", requireProjectAccess(), next(dependencies.GET));

export default router;

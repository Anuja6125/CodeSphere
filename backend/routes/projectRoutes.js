const express = require("express");

const router = express.Router();

const upload = require("../middlewares/uploadMiddleware");
const { uploadProject, getProject, analyzeRepo } = require("../controllers/projectControllers");

router.post("/upload", upload.single("project"), uploadProject);
router.post("/analyze-repo", express.json(), analyzeRepo);
router.get("/projects/:projectId", getProject);

module.exports = router;
const express = require("express");

const router = express.Router();

const upload = require("../middlewares/uploadMiddleware");
const { uploadProject, getProject } = require("../controllers/projectControllers");

router.post("/upload", upload.single("project"), uploadProject);
router.get("/projects/:projectId", getProject);

module.exports = router;
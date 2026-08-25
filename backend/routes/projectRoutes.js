const express = require("express");

const router = express.Router();

const upload = require("../middlewares/uploadMiddleware");
const { uploadProject } = require("../controllers/projectControllers");

router.post("/upload", upload.single("project"), uploadProject);

module.exports = router;
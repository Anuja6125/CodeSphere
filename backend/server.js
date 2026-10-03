const { checkEnv, config } = require("./src/config/env");
checkEnv();

const express = require("express");
const cors = require("cors");

const projectRoutes = require("./routes/projectRoutes");
const healthRoutes = require("./src/routes/health").default;

const app = express();
app.use(cors({ origin: config.corsOrigins }));

// New unified API lives under /api.
app.use("/api/health", healthRoutes);

// Legacy routes (/upload, /analyze-repo, /projects/:id).
// Kept until the new frontend stops using them (Phase 3).
app.use("/", projectRoutes);

app.get("/", (req, res) => {
    res.send("Backend is working!");
});

app.use((err, req, res, next) => {
    res.status(err.status || 400).json({
        message: err.message
    });
});

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
});

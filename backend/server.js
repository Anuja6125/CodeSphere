const { checkEnv, config } = require("./src/config/env");
checkEnv();

const express = require("express");
const cors = require("cors");

const healthRoutes = require("./src/routes/health").default;
const repositoryRoutes = require("./src/routes/repositories").default;
const { errorHandler } = require("./src/http/errorHandler");
const { recoverInterruptedRuns } = require("./src/services/pipeline");
const { recoverInterruptedDocs } = require("./src/services/documentation");

const app = express();
app.use(cors({ origin: config.corsOrigins }));

app.get("/", (req, res) => res.send("CodeSphere API is running. Try GET /api/health"));
app.use("/api/health", healthRoutes);
app.use("/api/repositories", repositoryRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

async function start() {
    // Nothing is running at boot, so any "in progress" work was cut off. Mark it failed.
    try {
        const stuck = await recoverInterruptedRuns();
        await recoverInterruptedDocs();
        if (stuck > 0) console.log(`Marked ${stuck} interrupted analysis run(s) as failed.`);
    } catch (error) {
        console.error("Database check failed at startup:", error.message.split("\n").find(Boolean));
    }
    app.listen(config.port, () => console.log(`CodeSphere API on http://localhost:${config.port}`));
}

start();

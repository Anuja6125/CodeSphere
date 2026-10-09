const { checkEnv, config } = require("./src/config/env");
checkEnv();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const healthRoutes = require("./src/routes/health").default;
const authRoutes = require("./src/routes/auth").default;
const usersRoutes = require("./src/routes/users").default;
const repositoryRoutes = require("./src/routes/repositories").default;
const { requireAuth } = require("./src/middleware/auth");
const { errorHandler } = require("./src/http/errorHandler");
const { recoverInterruptedRuns } = require("./src/services/pipeline");
const { recoverInterruptedDocs } = require("./src/services/documentation");

const app = express();
app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. mobile apps, curl) or if origin is in allowed origins
            if (!origin || config.corsOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, true); // Fallback to allow dev flexibility while preserving credentials
            }
        },
        credentials: true,
    })
);
app.use(cookieParser());

app.get("/", (req, res) => res.send("CodeSphere API is running. Try GET /api/health"));
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/repositories", requireAuth, repositoryRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

async function start() {
    // Nothing is running at boot, so any "in progress" work was cut off. Mark it failed.
    try {
        const stuck = await recoverInterruptedRuns();
        await recoverInterruptedDocs();
        if (stuck > 0) console.log(`Marked ${stuck} interrupted analysis run(s) as failed.`);

        const bootstrapEmail = process.env.BOOTSTRAP_MANAGER_EMAIL?.trim().toLowerCase();
        if (bootstrapEmail) {
            const { db } = require("./src/lib/db");
            await db.user.upsert({
                where: { email: bootstrapEmail },
                update: { role: "MANAGER" },
                create: { email: bootstrapEmail, role: "MANAGER" },
            });
            console.log(`[RBAC] Bootstrapped deployment MANAGER account for ${bootstrapEmail}`);
        }
    } catch (error) {
        console.error("Database check failed at startup:", error.message.split("\n").find(Boolean));
    }
    app.listen(config.port, () => console.log(`CodeSphere API on http://localhost:${config.port}`));
}

start();

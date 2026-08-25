const express = require("express");
require("./utils/fileScanner");

const app = express();

const PORT = 5000;

const projectRoutes = require("./routes/projectRoutes");

app.use("/", projectRoutes);

app.get("/", (req, res) => {
    res.send("Backend is working!");
});

app.use((err, req, res, next) => {
    res.status(400).json({
        message: err.message
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
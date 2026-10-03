console.log("UPLOAD MIDDLEWARE LOADED");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        const projectId = crypto.randomUUID();

        req.projectId = projectId;

        const uploadPath = path.join("uploads", projectId);

        fs.mkdirSync(uploadPath, { recursive: true });

        cb(null, uploadPath);
    },

    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage,

    fileFilter: (req, file, cb) => {

        const extension = path.extname(file.originalname).toLowerCase();

        if (extension === ".zip") {
            cb(null, true);
        } else {
            cb(new Error("Only ZIP files are allowed"));
        }
    }
});

module.exports = upload;
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { UPLOADS_DIR } from "../services/paths";
import { HttpError } from "../services/errors";

const MAX_MB = Number(process.env.MAX_REPO_ZIP_MB || 100);

/** Accept one .zip in field "project". Saved under uploads/<random>/upload.zip. */
export const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOADS_DIR, crypto.randomUUID());
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, _file, cb) => cb(null, "upload.zip"), // never trust the client file name on disk
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === ".zip") cb(null, true);
    else cb(new HttpError(400, "Only .zip files are allowed."));
  },
}).single("project");

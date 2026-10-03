import path from "path";

// Working folders. Contents are temporary: the database is the source of truth.
export const BACKEND_ROOT = path.resolve(__dirname, "../..");
export const UPLOADS_DIR = path.join(BACKEND_ROOT, "uploads");
export const EXTRACTED_DIR = path.join(BACKEND_ROOT, "extracted");

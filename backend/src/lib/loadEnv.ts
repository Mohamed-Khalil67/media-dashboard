import path from "node:path";
import { config } from "dotenv";

/**
 * Load `backend/.env` before any other module reads `process.env`.
 *
 * Resolved from this file's location (`src/lib` in dev, `dist/lib` in prod), not
 * from `process.cwd()`, so the server finds its config whether it is started
 * from `backend/` or from the repo root (`npm --prefix backend run dev`).
 * Variables already set in the environment win over the file.
 */
config({ path: path.resolve(__dirname, "..", "..", ".env") });

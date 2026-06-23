import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import facebookRoutes from "./modules/facebook/facebook.routes";
import shopifyRoutes from "./modules/shopify/shopify.routes";
import connectionsRoutes from "./modules/connections/connections.routes";
import syncRoutes from "./modules/sync/sync.routes";
import metricsRoutes from "./modules/metrics/metrics.routes";
import alertsRoutes from "./modules/alerts/alerts.routes";
import { apiLimiter } from "./middleware/rateLimit";
import { logger } from "./lib/logger";

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:4200", credentials: true }));
app.use(express.json());

// Skip rate limiters when running tests so suites can hammer endpoints.
if (process.env.NODE_ENV !== "test") {
  app.use("/api/", apiLimiter);
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Firebase handles brute-force protection upstream, so no /api/auth rate limiter.
app.use("/api/auth", authRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/shopify", shopifyRoutes);
app.use("/api/sync", syncRoutes);
// Prevent browsers from caching metrics/alerts responses so filter changes always hit the DB.
app.use("/api/metrics", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, metricsRoutes);
app.use("/api/alerts", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, alertsRoutes);

// Centralized error handler — must have 4 args for Express to recognize it.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, "unhandled request error");
  res.status(500).json({ error: "Internal server error" });
});

// Serve the Angular SPA in production. The build step copies
// frontend/dist/frontend/browser → backend/public before starting.
// Guard lets the dev server (no public/ dir) skip this block entirely.
import path from "path";
import { existsSync } from "fs";
const publicDir = path.join(__dirname, "..", "public");
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback: all non-/api paths return index.html so Angular handles routing.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

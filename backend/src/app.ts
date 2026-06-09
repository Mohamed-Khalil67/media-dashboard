import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import facebookRoutes from "./modules/facebook/facebook.routes";
import shopifyRoutes from "./modules/shopify/shopify.routes";
import tiktokRoutes from "./modules/tiktok/tiktok.routes";
import connectionsRoutes from "./modules/connections/connections.routes";
import syncRoutes from "./modules/sync/sync.routes";
import metricsRoutes from "./modules/metrics/metrics.routes";
import alertsRoutes from "./modules/alerts/alerts.routes";
import { apiLimiter, authLimiter } from "./middleware/rateLimit";

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

app.use("/api/auth", process.env.NODE_ENV === "test" ? (_req, _res, next) => next() : authLimiter, authRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/shopify", shopifyRoutes);
app.use("/api/tiktok", tiktokRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/alerts", alertsRoutes);

// Centralized error handler — must have 4 args for Express to recognize it.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

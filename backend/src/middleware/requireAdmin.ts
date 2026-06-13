import { Request, Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

/**
 * Gates a route to users whose User.role === "admin".
 * Must be mounted AFTER requireAuth — relies on req.userRole being set.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authed = req as AuthedRequest;
  if (authed.userRole !== "admin") {
    return res.status(403).json({
      error: "admin_required",
      message: "This area is restricted to administrators.",
    });
  }
  next();
}

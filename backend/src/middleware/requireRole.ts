import { Request, Response, NextFunction } from "express";
import { AuthedRequest, UserRole } from "./auth";

/**
 * Gates a route to one or more app-level user roles (admin | media_buyer | client).
 * Must be mounted AFTER requireAuth so req.userRole is populated.
 *
 * Usage:
 *   router.post("/foo", requireAuth, requireRole("media_buyer"), handler);
 *   router.delete("/bar", requireAuth, requireRole("admin", "media_buyer"), handler);
 */
export function requireRole(...allowed: UserRole[]) {
  return function (req: Request, res: Response, next: NextFunction) {
    const authed = req as AuthedRequest;
    if (!allowed.includes(authed.userRole)) {
      return res.status(403).json({
        error: "role_forbidden",
        message: "Your role does not have permission to perform this action.",
      });
    }
    next();
  };
}

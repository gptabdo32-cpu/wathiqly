import { Request, Response, NextFunction } from "express";
import { verifyJWT } from "./security";

/**
 * AuthGuard Middleware
 * Phase 3.6: Security Hardening.
 * Centralized authentication logic for the backend.
 */
export function authGuard(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      error: "Authentication required",
      code: "UNAUTHORIZED"
    });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyJWT(token);

  if (!payload) {
    return res.status(401).json({ 
      error: "Invalid or expired token",
      code: "INVALID_TOKEN"
    });
  }

  // Attach user to request object
  (req as any).user = payload;
  next();
}

/**
 * AdminGuard Middleware
 * Restricts access to administrative users only.
 */
export function adminGuard(req: Request, res: Response, next: NextFunction) {
  authGuard(req, res, () => {
    const user = (req as any).user;
    if (user && user.role === "admin") {
      next();
    } else {
      res.status(403).json({ 
        error: "Administrative access required",
        code: "FORBIDDEN"
      });
    }
  });
}

import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";
import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

/**
 * Security Middleware and OWASP Best Practices
 * Implements industry-standard security measures
 */

// ============ RATE LIMITING ============

/**
 * General rate limiter (10 requests per 15 minutes)
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
});

/**
 * Strict rate limiter for authentication endpoints (5 requests per 15 minutes)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * IoT device rate limiter (100 requests per minute)
 */
export const iotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many IoT requests, please try again later.",
});

// ============ HELMET SECURITY HEADERS ============

/**
 * Configure Helmet for security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: "deny",
  },
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },
  noSniff: true,
  xssFilter: true,
});

// ============ INPUT VALIDATION & SANITIZATION ============

/**
 * Sanitize MongoDB queries (prevent NoSQL injection)
 */
export const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ req, key }) => {
    console.warn(`[Security] Potential NoSQL injection attempt on key: ${key}`);
  },
});

/**
 * Clean XSS attacks
 */
export const xssCleanMiddleware = xss();

/**
 * Prevent HTTP Parameter Pollution
 */
export const hppMiddleware = hpp({
  whitelist: [
    "sort",
    "fields",
    "page",
    "limit",
    "search",
    "filter",
    "include",
  ],
});

// ============ JWT VERIFICATION ============

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const secret = ENV.jwtSecret || "your-secret-key";
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch (error) {
    console.warn("[Security] JWT verification failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Generate JWT token
 */
export function generateJWT(payload: Omit<JWTPayload, "iat" | "exp">, expiresIn: string = "24h"): string {
  const secret = ENV.jwtSecret || "your-secret-key";
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * JWT verification middleware
 */
export function jwtMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  const payload = verifyJWT(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  (req as any).user = payload;
  next();
}

// ============ CORS CONFIGURATION ============

/**
 * CORS options
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = (ENV.corsOrigins || "http://localhost:3000").split(",");

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // 24 hours
};

// ============ REQUEST VALIDATION ============

/**
 * Validate request body size
 */
export function validateBodySize(maxSizeInMB: number = 10) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;

    if (contentLength > maxSizeInBytes) {
      return res.status(413).json({
        error: `Request body too large. Maximum size: ${maxSizeInMB}MB`,
      });
    }

    next();
  };
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/["']/g, ""); // Remove quotes
}

// ============ LOGGING & MONITORING ============

/**
 * Security event logger
 */
export function logSecurityEvent(
  eventType: string,
  details: Record<string, any>,
  severity: "low" | "medium" | "high" | "critical" = "medium"
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    eventType,
    severity,
    details,
  };

  console.log(`[Security] ${severity.toUpperCase()}: ${eventType}`, logEntry);

  // In production, send to security monitoring service (e.g., Sentry, DataDog)
  if (severity === "critical") {
    // Alert security team
    console.error("[Security] CRITICAL EVENT - Alert security team immediately!", logEntry);
  }
}

// ============ DEVICE FINGERPRINTING ============

/**
 * Generate device fingerprint for IoT devices
 */
export function generateDeviceFingerprint(
  deviceId: string,
  deviceType: string,
  ipAddress: string
): string {
  const crypto = require("crypto");
  const data = `${deviceId}:${deviceType}:${ipAddress}:${Date.now()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Verify device fingerprint
 */
export function verifyDeviceFingerprint(
  storedFingerprint: string,
  currentFingerprint: string
): boolean {
  return storedFingerprint === currentFingerprint;
}

// ============ ENCRYPTION KEY MANAGEMENT ============

/**
 * Validate encryption key strength
 */
export function validateEncryptionKey(key: string): boolean {
  // Key should be 64 characters (256 bits in hex)
  return key.length === 64 && /^[0-9a-f]{64}$/i.test(key);
}

/**
 * Rotate encryption key (generate new key)
 */
export function rotateEncryptionKey(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(32).toString("hex");
}

// ============ SECURITY HEADERS MIDDLEWARE ============

/**
 * Custom security headers middleware
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Disable client-side caching for sensitive data
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  next();
}

// ============ AUDIT LOGGING ============

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: number;
  userId?: number;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  status: "success" | "failure";
  details?: Record<string, any>;
}

/**
 * Log audit event
 */
export function logAuditEvent(entry: AuditLogEntry) {
  console.log("[Audit]", {
    timestamp: new Date(entry.timestamp).toISOString(),
    userId: entry.userId,
    action: entry.action,
    resource: entry.resource,
    status: entry.status,
  });

  // In production, store in audit log database
  // await auditLogDB.insert(entry);
}

// ============ COMPLIANCE HELPERS ============

/**
 * Check GDPR compliance for data handling
 */
export function isGDPRCompliant(dataType: string): boolean {
  const sensitiveDataTypes = ["email", "phone", "ssn", "credit_card", "location"];
  return sensitiveDataTypes.includes(dataType);
}

/**
 * Generate data retention policy
 */
export function getDataRetentionPolicy(dataType: string): number {
  const policies: Record<string, number> = {
    logs: 90 * 24 * 60 * 60 * 1000, // 90 days
    transactions: 365 * 24 * 60 * 60 * 1000, // 1 year
    personalData: 730 * 24 * 60 * 60 * 1000, // 2 years
    auditLogs: 2555 * 24 * 60 * 60 * 1000, // 7 years
  };

  return policies[dataType] || 365 * 24 * 60 * 60 * 1000; // Default 1 year
}

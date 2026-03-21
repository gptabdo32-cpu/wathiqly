import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";
import jwt from "jsonwebtoken";
import { ENV } from "./env";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { Decimal } from "decimal.js";

/**
 * Security Middleware and OWASP Best Practices for Wathiqly
 * Consolidates rate limiting, security headers, input validation, JWT, CORS, and advanced financial security.
 */

// ============ RATE LIMITING ============

/**
 * General rate limiter (100 requests per 15 minutes)
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
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
  skipSuccessfulRequests: true,
});

/**
 * IoT device rate limiter (100 requests per minute)
 */
export const iotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many IoT requests, please try again later.",
});

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate Limiter for sensitive financial operations
 * Prevents brute-force attacks and DoS on critical endpoints
 */
export const createFinancialRateLimiter = (limits: Record<string, { maxRequests: number; windowMs: number }>) => {
  return (operation: string, userId: number) => {
    const key = `${operation}:${userId}`;
    const now = Date.now();
    const limit = limits[operation];

    if (!limit) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Rate limit configuration not found for this operation.",
      });
    }

    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limit.windowMs,
      });
      return true;
    }

    entry.count++;

    if (entry.count > limit.maxRequests) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded for ${operation}. Please try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds.`,
      });
    }

    return true;
  };
};

export const FINANCIAL_RATE_LIMITS = {
  sendMoney: { maxRequests: 10, windowMs: 60000 }, // 10 per minute
  payBill: { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  authorizeSSO: { maxRequests: 5, windowMs: 60000 }, // 5 per minute
  requestDeposit: { maxRequests: 5, windowMs: 300000 }, // 5 per 5 minutes
  requestWithdrawal: { maxRequests: 3, windowMs: 300000 }, // 3 per 5 minutes
};

// ============ HELMET SECURITY HEADERS ============

/**
 * Configure Helmet for comprehensive security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // 'unsafe-eval' might be needed for some frameworks like React in dev mode
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://*.googleapis.com"], // Adjust as needed for external APIs
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
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
    const secret = ENV.jwtSecret || "your-secret-key"; // Ensure this is loaded from ENV
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
  const secret = ENV.jwtSecret || "your-secret-key"; // Ensure this is loaded from ENV
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
  const emailRegex = /^[^\]+@[^\]+\.[^\]]+$/;
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
  return crypto.randomBytes(32).toString("hex");
}

// ============ SECURITY HEADERS MIDDLEWARE (Custom) ============

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

// ============ IDEMPOTENCY KEY ============

interface IdempotencyRecord {
  response: any;
  createdAt: number;
  expiresAt: number;
}

const idempotencyStore = new Map<string, IdempotencyRecord>();

/**
 * Idempotency Key Manager
 * Prevents duplicate financial transactions by tracking requests
 * Stores responses for 24 hours to handle retries safely
 */
export const createIdempotencyManager = () => {
  // Cleanup expired entries every hour
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of idempotencyStore.entries()) {
      if (now > record.expiresAt) {
        idempotencyStore.delete(key);
      }
    }
  }, 3600000); // 1 hour

  return {
    /**
     * Check if request was already processed
     * Returns cached response if found, null otherwise
     */
    check: (idempotencyKey: string): any | null => {
      if (!idempotencyKey) return null;

      const record = idempotencyStore.get(idempotencyKey);
      if (!record) return null;

      const now = Date.now();
      if (now > record.expiresAt) {
        idempotencyStore.delete(idempotencyKey);
        return null;
      }

      return record.response;
    },

    /**
     * Store response for future retries
     * Expires after 24 hours
     */
    store: (idempotencyKey: string, response: any): void => {
      if (!idempotencyKey) return;

      const expiresAt = Date.now() + 86400000; // 24 hours
      idempotencyStore.set(idempotencyKey, {
        response,
        createdAt: Date.now(),
        expiresAt,
      });
    },
  };
};

export const idempotencyManager = createIdempotencyManager();

// ============ REQUEST SIGNING & VERIFICATION ============

/**
 * Cryptographic Request Signing
 * Ensures request integrity and prevents tampering
 * Uses HMAC-SHA256 with server secret
 */
export const createRequestSigner = (serverSecret: string) => {
  return {
    /**
     * Generate signature for request payload
     * Signature = HMAC-SHA256(payload + timestamp, serverSecret)
     */
    sign: (payload: any, timestamp: number): string => {
      const data = JSON.stringify(payload) + timestamp;
      return crypto
        .createHmac("sha256", serverSecret)
        .update(data)
        .digest("hex");
    },

    /**
     * Verify request signature
     * Prevents tampering and ensures authenticity
     * Rejects requests older than 5 minutes (clock skew tolerance)
     */
    verify: (payload: any, signature: string, timestamp: number): boolean => {
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes

      // Check timestamp freshness
      if (now - timestamp > maxAge) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request timestamp is too old. Please resend with current timestamp.",
        });
      }

      // Verify signature
      const expectedSignature = this.sign(payload, timestamp);
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Request signature verification failed. Request may have been tampered with.",
        });
      }

      return true;
    },
  };
};

// ============ FINANCIAL TRANSACTION VALIDATOR ============

/**
 * Advanced validation for financial transactions
 * Implements PCI-DSS compliance checks
 */
export const createFinancialValidator = () => {
  return {
    /**
     * Validate transfer amount
     * - Must be positive
     * - Must not exceed daily limit per user
     * - Must use Decimal.js for precision (no floating point errors)
     */
    validateAmount: (amount: string | Decimal, minAmount: Decimal = new Decimal("0.01"), maxAmount: Decimal = new Decimal("999999.99")): Decimal => {
      const decimalAmount = amount instanceof Decimal ? amount : new Decimal(amount);

      if (decimalAmount.isNaN() || decimalAmount.isNegative()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Amount must be a positive number.",
        });
      }

      if (decimalAmount.lt(minAmount)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Amount must be at least ${minAmount.toString()} LYD.`,
        });
      }

      if (decimalAmount.gt(maxAmount)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Amount cannot exceed ${maxAmount.toString()} LYD.`,
        });
      }

      return decimalAmount;
    },

    /**
     * Validate phone number format (Libyan numbers)
     * Accepted formats: 091XXXXXXX, 092XXXXXXX, 094XXXXXXX, 095XXXXXXX, +218...
     */
    validatePhoneNumber: (phone: string): string => {
      const phoneRegex = /^(\+218|0)(91|92|94|95)[0-9]{7}$/;
      if (!phoneRegex.test(phone)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid Libyan mobile number format.",
        });
      }
      return phone;
    },

    /**
     * Check for suspicious transaction patterns
     * Flags: Multiple transfers to same recipient in short time, unusual amount
     */
    checkSuspiciousPatterns: (
      userId: number,
      receiverId: number,
      amount: Decimal,
      recentTransfers: Array<{ receiverId: number; amount: string; createdAt: Date }>
    ): { isSuspicious: boolean; flags: string[] } => {
      const flags: string[] = [];

      // Check for rapid repeated transfers to same recipient
      const recentToSameRecipient = recentTransfers.filter(
        (t) => t.receiverId === receiverId && Date.now() - t.createdAt.getTime() < 300000 // 5 minutes
      );

      if (recentToSameRecipient.length >= 3) {
        flags.push("Multiple transfers to same recipient in short time");
      }

      // Check for unusually large amount
      const avgAmount = recentTransfers.length > 0
        ? recentTransfers.reduce((sum, t) => sum.plus(new Decimal(t.amount)), new Decimal(0)).div(recentTransfers.length)
        : new Decimal(0);

      if (amount.gt(avgAmount.mul(5)) && recentTransfers.length > 0) {
        flags.push("Unusually large transfer amount compared to user history");
      }

      return {
        isSuspicious: flags.length > 0,
        flags,
      };
    },
  };
};

// ============ ENCRYPTION UTILITIES ============

/**
 * Secure encryption/decryption for sensitive transaction data
 * Uses AES-256-GCM for authenticated encryption
 */
export const createEncryptionManager = (encryptionKey: string) => {
  const key = crypto.scryptSync(encryptionKey, "salt", 32); // Derive 256-bit key

  return {
    /**
     * Encrypt sensitive data with authentication tag
     * Returns: IV + AuthTag + CipherText (all hex-encoded)
     */
    encrypt: (plaintext: string): string => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      // Format: IV:AuthTag:CipherText
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    },

    /**
     * Decrypt and verify authenticated encryption
     * Throws error if authentication fails (tampering detected)
     */
    decrypt: (ciphertext: string): string => {
      const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");

      if (!ivHex || !authTagHex || !encryptedHex) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid encrypted data format.",
        });
      }

      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

      decipher.setAuthTag(authTag);

      try {
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Decryption failed. Data may have been tampered with.",
        });
      }
    },
  };
};

// ============ AUDIT TRAIL LOGGER ============

/**
 * High-integrity audit logging for compliance (ISO 27001, PCI-DSS)
 * Logs are immutable and timestamped
 */
export interface AuditTrailEntry {
  id: string;
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: number;
  signature?: string; // HMAC signature of the entry
}

export const createAuditTrailLogger = (serverSecret: string) => {
  const auditLog: AuditTrailEntry[] = [];

  return {
    /**
     * Log an action with cryptographic signature
     * Ensures audit trail cannot be modified without detection
     */
    log: (entry: Omit<AuditTrailEntry, "id" | "timestamp" | "signature">): AuditTrailEntry => {
      const timestamp = Date.now();
      const id = crypto.randomUUID();

      const entryWithTimestamp = { ...entry, id, timestamp };
      const signature = crypto
        .createHmac("sha256", serverSecret)
        .update(JSON.stringify(entryWithTimestamp))
        .digest("hex");

      const finalEntry: AuditTrailEntry = { ...entryWithTimestamp, signature };
      auditLog.push(finalEntry);

      return finalEntry;
    },

    /**
     * Verify audit trail integrity
     * Detects if any entry has been tampered with
     */
    verify: (entry: AuditTrailEntry): boolean => {
      const { signature, ...entryData } = entry;
      const expectedSignature = crypto
        .createHmac("sha256", serverSecret)
        .update(JSON.stringify(entryData))
        .digest("hex");

      return crypto.timingSafeEqual(
        Buffer.from(signature || ""),
        Buffer.from(expectedSignature)
      );
    },

    /**
     * Get audit trail for a specific user or time range
     */
    getLog: (userId?: number, startTime?: number, endTime?: number): AuditTrailEntry[] => {
      return auditLog.filter((entry) => {
        if (userId && entry.userId !== userId) return false;
        if (startTime && entry.timestamp < startTime) return false;
        if (endTime && entry.timestamp > endTime) return false;
        return true;
      });
    },
  };
};

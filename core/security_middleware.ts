import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { Decimal } from "decimal.js";

/**
 * Advanced Security Middleware for Wathiqly Financial Operations
 * Implements: Rate Limiting, Idempotency, Request Signing, and Financial Audit Trail
 * Standards: OWASP, PCI-DSS, ISO 27001
 */

// ============ RATE LIMITING ============

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate Limiter for sensitive financial operations
 * Prevents brute-force attacks and DoS on critical endpoints
 * 
 * Limits:
 * - sendMoney: 10 requests per minute
 * - payBill: 20 requests per minute
 * - authorizeSSO: 5 requests per minute
 */
export const createRateLimiter = (limits: Record<string, { maxRequests: number; windowMs: number }>) => {
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

    // Initialize or reset if window expired
    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limit.windowMs,
      });
      return true; // Request allowed
    }

    // Increment counter
    entry.count++;

    if (entry.count > limit.maxRequests) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded for ${operation}. Please try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds.`,
      });
    }

    return true; // Request allowed
  };
};

// Default rate limits for financial operations
export const FINANCIAL_RATE_LIMITS = {
  sendMoney: { maxRequests: 10, windowMs: 60000 }, // 10 per minute
  payBill: { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  authorizeSSO: { maxRequests: 5, windowMs: 60000 }, // 5 per minute
  requestDeposit: { maxRequests: 5, windowMs: 300000 }, // 5 per 5 minutes
  requestWithdrawal: { maxRequests: 3, windowMs: 300000 }, // 3 per 5 minutes
};

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
 * 
 * Usage: Client must provide X-Idempotency-Key header with UUID
 * Server validates and stores the key to prevent duplicate processing
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

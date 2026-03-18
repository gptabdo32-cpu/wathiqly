import { describe, it, expect, beforeEach } from "vitest";
import {
  createRateLimiter,
  FINANCIAL_RATE_LIMITS,
  idempotencyManager,
  createFinancialValidator,
  createAuditTrailLogger,
} from "./core/security_middleware";
import {
  createTokenGenerator,
  createPKCEManager,
  createSessionManager,
  createConsentManager,
} from "./core/auth/oauth_enhanced";
import { Decimal } from "decimal.js";
import { TRPCError } from "@trpc/server";

/**
 * Comprehensive Security Test Suite for Wathiqly ID & Pay Wallet
 * Tests: Rate Limiting, Idempotency, Token Management, PKCE, Session Management
 */

describe("Security Middleware", () => {
  describe("Rate Limiting", () => {
    it("should allow requests within rate limit", () => {
      const rateLimiter = createRateLimiter(FINANCIAL_RATE_LIMITS);
      const userId = 1;

      // Should allow 10 requests per minute
      for (let i = 0; i < 10; i++) {
        expect(() => rateLimiter("sendMoney", userId)).not.toThrow();
      }
    });

    it("should reject requests exceeding rate limit", () => {
      const rateLimiter = createRateLimiter(FINANCIAL_RATE_LIMITS);
      const userId = 2;

      // Make 10 requests (at limit)
      for (let i = 0; i < 10; i++) {
        rateLimiter("sendMoney", userId);
      }

      // 11th request should fail
      expect(() => rateLimiter("sendMoney", userId)).toThrow(TRPCError);
    });

    it("should have different limits for different operations", () => {
      const rateLimiter = createRateLimiter(FINANCIAL_RATE_LIMITS);
      const userId = 3;

      // sendMoney: 10 per minute
      // payBill: 20 per minute
      // Both should work independently

      for (let i = 0; i < 10; i++) {
        rateLimiter("sendMoney", userId);
      }

      for (let i = 0; i < 20; i++) {
        rateLimiter("payBill", userId);
      }

      expect(() => rateLimiter("sendMoney", userId)).toThrow();
      expect(() => rateLimiter("payBill", userId)).not.toThrow();
    });
  });

  describe("Idempotency Manager", () => {
    it("should return null for new idempotency key", () => {
      const key = "unique-key-123";
      const result = idempotencyManager.check(key);
      expect(result).toBeNull();
    });

    it("should store and retrieve response", () => {
      const key = "unique-key-456";
      const response = { success: true, reference: "REF-123" };

      idempotencyManager.store(key, response);
      const retrieved = idempotencyManager.check(key);

      expect(retrieved).toEqual(response);
    });

    it("should prevent duplicate transactions", () => {
      const key = "duplicate-test-key";
      const response1 = { success: true, reference: "REF-001" };

      idempotencyManager.store(key, response1);

      // Same key should return cached response
      const response2 = idempotencyManager.check(key);
      expect(response2).toEqual(response1);
      expect(response2.reference).toBe("REF-001");
    });
  });

  describe("Financial Validator", () => {
    const validator = createFinancialValidator();

    it("should validate positive amounts", () => {
      const amount = validator.validateAmount("100.00");
      expect(amount.toNumber()).toBe(100);
    });

    it("should reject negative amounts", () => {
      expect(() => validator.validateAmount("-50.00")).toThrow(TRPCError);
    });

    it("should reject amounts below minimum", () => {
      expect(() => validator.validateAmount("0.00")).toThrow(TRPCError);
    });

    it("should reject amounts above maximum", () => {
      expect(() => validator.validateAmount("1000000.00")).toThrow(TRPCError);
    });

    it("should validate Libyan phone numbers", () => {
      const validPhones = [
        "091234567890",
        "092123456789",
        "094987654321",
        "095111111111",
        "+218911111111",
      ];

      validPhones.forEach((phone) => {
        expect(() => validator.validatePhoneNumber(phone)).not.toThrow();
      });
    });

    it("should reject invalid phone numbers", () => {
      const invalidPhones = [
        "01234567890", // Wrong prefix
        "091234567", // Too short
        "091234567890123", // Too long
        "abcdefghijk", // Invalid characters
      ];

      invalidPhones.forEach((phone) => {
        expect(() => validator.validatePhoneNumber(phone)).toThrow(TRPCError);
      });
    });

    it("should detect suspicious transaction patterns", () => {
      const recentTransfers = [
        { receiverId: 5, amount: "50.00", createdAt: new Date(Date.now() - 60000) },
        { receiverId: 5, amount: "50.00", createdAt: new Date(Date.now() - 120000) },
        { receiverId: 5, amount: "50.00", createdAt: new Date(Date.now() - 180000) },
      ];

      const result = validator.checkSuspiciousPatterns(1, 5, new Decimal("50.00"), recentTransfers);

      expect(result.isSuspicious).toBe(true);
      expect(result.flags).toContain("Multiple transfers to same recipient in short time");
    });

    it("should detect unusually large transfers", () => {
      const recentTransfers = [
        { receiverId: 6, amount: "10.00", createdAt: new Date(Date.now() - 3600000) },
        { receiverId: 6, amount: "15.00", createdAt: new Date(Date.now() - 7200000) },
      ];

      const result = validator.checkSuspiciousPatterns(1, 6, new Decimal("500.00"), recentTransfers);

      expect(result.isSuspicious).toBe(true);
      expect(result.flags).toContain("Unusually large transfer amount compared to user history");
    });
  });

  describe("Audit Trail Logger", () => {
    it("should create audit log entries", () => {
      const logger = createAuditTrailLogger("test-secret");

      const entry = logger.log({
        userId: 1,
        action: "p2p_transfer",
        entityType: "p2pTransfer",
        entityId: 100,
        newState: { amount: "50.00" },
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.signature).toBeDefined();
    });

    it("should verify audit log integrity", () => {
      const logger = createAuditTrailLogger("test-secret");

      const entry = logger.log({
        userId: 2,
        action: "bill_payment",
        entityType: "billPayment",
        entityId: 200,
        newState: { provider: "libyana" },
      });

      const isValid = logger.verify(entry);
      expect(isValid).toBe(true);
    });

    it("should detect tampered audit logs", () => {
      const logger = createAuditTrailLogger("test-secret");

      const entry = logger.log({
        userId: 3,
        action: "sso_authorization",
        entityType: "ssoClient",
        entityId: 300,
      });

      // Tamper with the entry
      entry.newState = { scopes: ["admin", "write"] };

      // Verification should fail (or we can check signature mismatch)
      // In production, this would be caught by signature verification
      expect(() => logger.verify(entry)).toThrow();
    });

    it("should retrieve logs for specific user and time range", () => {
      const logger = createAuditTrailLogger("test-secret");

      const now = Date.now();
      logger.log({
        userId: 4,
        action: "action1",
        entityType: "type1",
        entityId: 1,
      });

      logger.log({
        userId: 5,
        action: "action2",
        entityType: "type2",
        entityId: 2,
      });

      const logsForUser4 = logger.getLog(4);
      expect(logsForUser4.length).toBe(1);
      expect(logsForUser4[0].userId).toBe(4);
    });
  });
});

describe("OAuth 2.0 Enhanced", () => {
  describe("Token Management", () => {
    const tokenGen = createTokenGenerator("test-secret");

    it("should generate access token with expiration", () => {
      const token = tokenGen.generateAccessToken(1, 1, ["profile", "phone"]);

      expect(token.token).toBeDefined();
      expect(token.type).toBe("Bearer");
      expect(token.expiresIn).toBe(3600); // 1 hour
      expect(token.scope).toContain("profile");
    });

    it("should verify valid access token", () => {
      const token = tokenGen.generateAccessToken(2, 2, ["profile"]);
      const verified = tokenGen.verifyAccessToken(token.token);

      expect(verified.token).toBe(token.token);
    });

    it("should reject invalid access token", () => {
      expect(() => tokenGen.verifyAccessToken("invalid-token")).toThrow(TRPCError);
    });

    it("should generate refresh token with longer expiration", () => {
      const token = tokenGen.generateRefreshToken(3, 3, ["profile", "phone"]);

      expect(token.token).toBeDefined();
      expect(token.expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000); // > 6 days
    });

    it("should rotate refresh token", () => {
      const oldToken = tokenGen.generateRefreshToken(4, 4, ["profile"]);
      const { accessToken, refreshToken } = tokenGen.rotateRefreshToken(oldToken.token);

      expect(accessToken.token).not.toBe(oldToken.token);
      expect(refreshToken.token).not.toBe(oldToken.token);
      expect(refreshToken.rotationCount).toBe(1);
    });

    it("should prevent refresh token reuse attack", () => {
      const token = tokenGen.generateRefreshToken(5, 5, ["profile"]);
      const { refreshToken: newToken } = tokenGen.rotateRefreshToken(token.token);

      // Try to use old token again
      expect(() => tokenGen.rotateRefreshToken(token.token)).toThrow(TRPCError);
    });

    it("should revoke token", () => {
      const token = tokenGen.generateRefreshToken(6, 6, ["profile"]);
      tokenGen.revokeToken(token.token);

      expect(() => tokenGen.rotateRefreshToken(token.token)).toThrow(TRPCError);
    });
  });

  describe("PKCE Manager", () => {
    const pkceManager = createPKCEManager();

    it("should validate PKCE parameters", () => {
      const verifier = crypto.randomBytes(32).toString("base64url").slice(0, 128);
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

      expect(() => pkceManager.validatePKCEParameters(challenge, verifier)).not.toThrow();
    });

    it("should reject invalid code challenge length", () => {
      expect(() => pkceManager.validatePKCEParameters("short", "verifier")).toThrow(TRPCError);
    });

    it("should generate authorization code", () => {
      const code = pkceManager.generateAuthorizationCode(1, 1, "challenge123", "S256", "https://example.com", [
        "profile",
      ]);

      expect(code).toBeDefined();
      expect(code.length).toBeGreaterThan(0);
    });

    it("should exchange authorization code with PKCE verification", () => {
      const verifier = crypto.randomBytes(32).toString("base64url").slice(0, 128);
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

      const code = pkceManager.generateAuthorizationCode(2, 2, challenge, "S256", "https://example.com", [
        "profile",
      ]);

      const result = pkceManager.exchangeAuthorizationCode(code, verifier, 2);

      expect(result.userId).toBe(2);
      expect(result.scopes).toContain("profile");
    });

    it("should reject authorization code with wrong verifier", () => {
      const verifier = crypto.randomBytes(32).toString("base64url").slice(0, 128);
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

      const code = pkceManager.generateAuthorizationCode(3, 3, challenge, "S256", "https://example.com", [
        "profile",
      ]);

      const wrongVerifier = crypto.randomBytes(32).toString("base64url").slice(0, 128);

      expect(() => pkceManager.exchangeAuthorizationCode(code, wrongVerifier, 3)).toThrow(TRPCError);
    });

    it("should prevent authorization code reuse", () => {
      const verifier = crypto.randomBytes(32).toString("base64url").slice(0, 128);
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

      const code = pkceManager.generateAuthorizationCode(4, 4, challenge, "S256", "https://example.com", [
        "profile",
      ]);

      // First exchange should succeed
      pkceManager.exchangeAuthorizationCode(code, verifier, 4);

      // Second exchange should fail
      expect(() => pkceManager.exchangeAuthorizationCode(code, verifier, 4)).toThrow(TRPCError);
    });
  });

  describe("Session Management", () => {
    const sessionManager = createSessionManager(3600000); // 1 hour

    it("should create session", () => {
      const session = sessionManager.createSession(1, 1, ["profile"], "192.168.1.1", "Mozilla/5.0");

      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe(1);
      expect(session.isActive).toBe(true);
    });

    it("should validate session", () => {
      const session = sessionManager.createSession(2, 2, ["profile"], "192.168.1.2", "Mozilla/5.0");

      const validated = sessionManager.validateSession(session.sessionId, "192.168.1.2", "Mozilla/5.0");

      expect(validated.userId).toBe(2);
    });

    it("should detect session device fingerprint mismatch", () => {
      const session = sessionManager.createSession(3, 3, ["profile"], "192.168.1.3", "Mozilla/5.0");

      // Try to access with different IP
      expect(() => sessionManager.validateSession(session.sessionId, "192.168.1.4", "Mozilla/5.0")).toThrow(
        TRPCError
      );
    });

    it("should rotate session ID", () => {
      const oldSession = sessionManager.createSession(4, 4, ["profile"], "192.168.1.4", "Mozilla/5.0");
      const newSession = sessionManager.rotateSession(oldSession.sessionId);

      expect(newSession.sessionId).not.toBe(oldSession.sessionId);
      expect(newSession.userId).toBe(oldSession.userId);
    });

    it("should terminate session", () => {
      const session = sessionManager.createSession(5, 5, ["profile"], "192.168.1.5", "Mozilla/5.0");

      sessionManager.terminateSession(session.sessionId);

      expect(() => sessionManager.validateSession(session.sessionId, "192.168.1.5", "Mozilla/5.0")).toThrow(
        TRPCError
      );
    });

    it("should get active sessions for user", () => {
      sessionManager.createSession(6, 6, ["profile"], "192.168.1.6", "Mozilla/5.0");
      sessionManager.createSession(6, 6, ["phone"], "192.168.1.7", "Chrome/90");

      const sessions = sessionManager.getActiveSessions(6);

      expect(sessions.length).toBe(2);
      expect(sessions.every((s) => s.userId === 6)).toBe(true);
    });

    it("should terminate all sessions for user", () => {
      sessionManager.createSession(7, 7, ["profile"], "192.168.1.8", "Mozilla/5.0");
      sessionManager.createSession(7, 7, ["phone"], "192.168.1.9", "Chrome/90");

      sessionManager.terminateAllSessions(7);

      const sessions = sessionManager.getActiveSessions(7);
      expect(sessions.length).toBe(0);
    });
  });

  describe("Consent Manager", () => {
    const consentManager = createConsentManager();

    it("should grant consent", () => {
      const consent = consentManager.grantConsent(1, 1, ["profile", "phone"]);

      expect(consent.userId).toBe(1);
      expect(consent.clientId).toBe(1);
      expect(consent.scopes).toContain("profile");
    });

    it("should check consent", () => {
      consentManager.grantConsent(2, 2, ["profile", "phone"]);

      const hasConsent = consentManager.checkConsent(2, 2, ["profile"]);
      expect(hasConsent).toBe(true);
    });

    it("should reject if not all scopes are granted", () => {
      consentManager.grantConsent(3, 3, ["profile"]);

      const hasConsent = consentManager.checkConsent(3, 3, ["profile", "phone"]);
      expect(hasConsent).toBe(false);
    });

    it("should revoke consent", () => {
      consentManager.grantConsent(4, 4, ["profile"]);
      consentManager.revokeConsent(4, 4);

      const hasConsent = consentManager.checkConsent(4, 4, ["profile"]);
      expect(hasConsent).toBe(false);
    });

    it("should get user consents", () => {
      consentManager.grantConsent(5, 5, ["profile"]);
      consentManager.grantConsent(5, 6, ["phone"]);

      const consents = consentManager.getUserConsents(5);

      expect(consents.length).toBe(2);
      expect(consents.every((c) => c.userId === 5)).toBe(true);
    });
  });
});

// Import crypto for PKCE tests
import crypto from "crypto";

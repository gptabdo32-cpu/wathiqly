import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { Decimal } from "decimal.js";

/**
 * Enhanced OAuth 2.0 Implementation with PKCE and Token Rotation
 * Implements: RFC 6234, RFC 7636 (PKCE), RFC 6749 (OAuth 2.0)
 * Standards: OpenID Connect, OWASP, ISO 27001
 */

// ============ TOKEN MANAGEMENT ============

export interface AccessToken {
  token: string;
  type: "Bearer";
  expiresIn: number; // seconds
  expiresAt: number; // timestamp
  scope: string[];
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
}

export interface RefreshToken {
  token: string;
  userId: number;
  clientId: number;
  scope: string[];
  issuedAt: number;
  expiresAt: number;
  rotationCount: number;
  lastRotatedAt: number;
  isRevoked: boolean;
}

// In-memory token store (should be Redis in production)
const tokenStore = new Map<string, AccessToken>();
const refreshTokenStore = new Map<string, RefreshToken>();

/**
 * Token Generator
 * Creates cryptographically secure tokens with expiration
 */
export const createTokenGenerator = (serverSecret: string) => {
  return {
    /**
     * Generate Access Token (short-lived, 1 hour)
     * Format: Bearer <random_token>
     */
    generateAccessToken: (userId: number, clientId: number, scopes: string[]): AccessToken => {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresIn = 3600; // 1 hour
      const expiresAt = Date.now() + expiresIn * 1000;

      const accessToken: AccessToken = {
        token,
        type: "Bearer",
        expiresIn,
        expiresAt,
        scope: scopes,
      };

      tokenStore.set(token, accessToken);

      return accessToken;
    },

    /**
     * Generate Refresh Token (long-lived, 7 days)
     * Used to obtain new access tokens without re-authentication
     */
    generateRefreshToken: (userId: number, clientId: number, scopes: string[]): RefreshToken => {
      const token = crypto.randomBytes(32).toString("hex");
      const issuedAt = Date.now();
      const expiresAt = issuedAt + 7 * 24 * 3600 * 1000; // 7 days

      const refreshToken: RefreshToken = {
        token,
        userId,
        clientId,
        scope: scopes,
        issuedAt,
        expiresAt,
        rotationCount: 0,
        lastRotatedAt: issuedAt,
        isRevoked: false,
      };

      refreshTokenStore.set(token, refreshToken);

      return refreshToken;
    },

    /**
     * Verify Access Token
     */
    verifyAccessToken: (token: string): AccessToken => {
      const accessToken = tokenStore.get(token);

      if (!accessToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired access token.",
        });
      }

      if (Date.now() > accessToken.expiresAt) {
        tokenStore.delete(token);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Access token has expired.",
        });
      }

      return accessToken;
    },

    /**
     * Rotate Refresh Token (Token Rotation Pattern)
     * Generates new access + refresh token pair, invalidates old refresh token
     * Prevents token reuse attacks
     */
    rotateRefreshToken: (oldRefreshToken: string): { accessToken: AccessToken; refreshToken: RefreshToken } => {
      const refreshToken = refreshTokenStore.get(oldRefreshToken);

      if (!refreshToken || refreshToken.isRevoked) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or revoked refresh token.",
        });
      }

      if (Date.now() > refreshToken.expiresAt) {
        refreshTokenStore.delete(oldRefreshToken);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Refresh token has expired.",
        });
      }

      // Detect potential token reuse attack (rotation count too high)
      if (refreshToken.rotationCount > 100) {
        refreshTokenStore.delete(oldRefreshToken);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Suspicious token rotation activity detected. Token revoked.",
        });
      }

      // Mark old token as revoked
      refreshToken.isRevoked = true;

      // Generate new token pair
      const newAccessToken = this.generateAccessToken(
        refreshToken.userId,
        refreshToken.clientId,
        refreshToken.scope
      );

      const newRefreshToken = this.generateRefreshToken(
        refreshToken.userId,
        refreshToken.clientId,
        refreshToken.scope
      );

      // Update rotation metadata
      newRefreshToken.rotationCount = refreshToken.rotationCount + 1;
      newRefreshToken.lastRotatedAt = Date.now();

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    },

    /**
     * Revoke Token (for logout or security incidents)
     */
    revokeToken: (token: string): void => {
      const refreshToken = refreshTokenStore.get(token);
      if (refreshToken) {
        refreshToken.isRevoked = true;
      }
      tokenStore.delete(token);
    },
  };
};

// ============ PKCE (PROOF KEY FOR CODE EXCHANGE) ============

/**
 * PKCE Manager
 * Implements RFC 7636 to protect authorization code flow
 * Especially important for native/mobile applications
 */
export const createPKCEManager = () => {
  // Store authorization codes with PKCE challenge
  const authorizationCodeStore = new Map<
    string,
    {
      code: string;
      userId: number;
      clientId: number;
      codeChallenge: string;
      codeChallengeMethod: "S256" | "plain";
      redirectUri: string;
      scopes: string[];
      issuedAt: number;
      expiresAt: number;
      isUsed: boolean;
    }
  >();

  return {
    /**
     * Generate Authorization Code
     * Valid for 10 minutes
     */
    generateAuthorizationCode: (
      userId: number,
      clientId: number,
      codeChallenge: string,
      codeChallengeMethod: "S256" | "plain",
      redirectUri: string,
      scopes: string[]
    ): string => {
      const code = crypto.randomBytes(32).toString("hex");
      const issuedAt = Date.now();
      const expiresAt = issuedAt + 600000; // 10 minutes

      authorizationCodeStore.set(code, {
        code,
        userId,
        clientId,
        codeChallenge,
        codeChallengeMethod,
        redirectUri,
        scopes,
        issuedAt,
        expiresAt,
        isUsed: false,
      });

      return code;
    },

    /**
     * Exchange Authorization Code for Access Token
     * Verifies PKCE code verifier matches the challenge
     */
    exchangeAuthorizationCode: (
      code: string,
      codeVerifier: string,
      clientId: number
    ): { userId: number; scopes: string[] } => {
      const authCode = authorizationCodeStore.get(code);

      if (!authCode) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid authorization code.",
        });
      }

      // Check expiration
      if (Date.now() > authCode.expiresAt) {
        authorizationCodeStore.delete(code);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Authorization code has expired.",
        });
      }

      // Check if already used (prevent authorization code reuse)
      if (authCode.isUsed) {
        authorizationCodeStore.delete(code);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Authorization code has already been used. Possible attack detected.",
        });
      }

      // Verify client ID
      if (authCode.clientId !== clientId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Client ID mismatch.",
        });
      }

      // Verify PKCE code verifier
      let expectedChallenge: string;

      if (authCode.codeChallengeMethod === "S256") {
        // SHA256(codeVerifier)
        expectedChallenge = crypto
          .createHash("sha256")
          .update(codeVerifier)
          .digest("base64url");
      } else {
        // plain (no hashing)
        expectedChallenge = codeVerifier;
      }

      if (expectedChallenge !== authCode.codeChallenge) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "PKCE code verifier verification failed.",
        });
      }

      // Mark as used
      authCode.isUsed = true;

      return {
        userId: authCode.userId,
        scopes: authCode.scopes,
      };
    },

    /**
     * Validate PKCE Parameters
     * Ensures code challenge and verifier meet RFC 7636 requirements
     */
    validatePKCEParameters: (codeChallenge: string, codeVerifier: string): boolean => {
      // Code challenge must be 43-128 characters
      if (codeChallenge.length < 43 || codeChallenge.length > 128) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid code challenge length.",
        });
      }

      // Code verifier must be 43-128 characters
      if (codeVerifier.length < 43 || codeVerifier.length > 128) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid code verifier length.",
        });
      }

      // Both must contain only unreserved characters
      const unreservedRegex = /^[A-Za-z0-9\-._~]+$/;
      if (!unreservedRegex.test(codeChallenge) || !unreservedRegex.test(codeVerifier)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Code challenge/verifier contains invalid characters.",
        });
      }

      return true;
    },
  };
};

// ============ SESSION MANAGEMENT ============

/**
 * Secure Session Manager
 * Implements secure session handling with rotation and timeout
 */
export interface Session {
  sessionId: string;
  userId: number;
  clientId: number;
  scopes: string[];
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
}

export const createSessionManager = (sessionTimeout: number = 3600000) => {
  // 1 hour default timeout
  const sessionStore = new Map<string, Session>();

  return {
    /**
     * Create New Session
     */
    createSession: (
      userId: number,
      clientId: number,
      scopes: string[],
      ipAddress: string,
      userAgent: string
    ): Session => {
      const sessionId = crypto.randomBytes(32).toString("hex");
      const now = Date.now();

      const session: Session = {
        sessionId,
        userId,
        clientId,
        scopes,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: now + sessionTimeout,
        ipAddress,
        userAgent,
        isActive: true,
      };

      sessionStore.set(sessionId, session);

      return session;
    },

    /**
     * Validate Session
     * Checks expiration and activity timeout
     */
    validateSession: (sessionId: string, ipAddress: string, userAgent: string): Session => {
      const session = sessionStore.get(sessionId);

      if (!session || !session.isActive) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or inactive session.",
        });
      }

      const now = Date.now();

      // Check expiration
      if (now > session.expiresAt) {
        session.isActive = false;
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session has expired.",
        });
      }

      // Check activity timeout
      if (now - session.lastActivityAt > sessionTimeout) {
        session.isActive = false;
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session inactive timeout exceeded.",
        });
      }

      // Verify IP and User Agent (basic device fingerprinting)
      if (session.ipAddress !== ipAddress || session.userAgent !== userAgent) {
        session.isActive = false;
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session device fingerprint mismatch. Possible session hijacking detected.",
        });
      }

      // Update last activity
      session.lastActivityAt = now;

      return session;
    },

    /**
     * Rotate Session ID
     * Prevents session fixation attacks
     */
    rotateSession: (oldSessionId: string): Session => {
      const oldSession = sessionStore.get(oldSessionId);

      if (!oldSession) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid session.",
        });
      }

      // Create new session with same data
      const newSession = this.createSession(
        oldSession.userId,
        oldSession.clientId,
        oldSession.scopes,
        oldSession.ipAddress,
        oldSession.userAgent
      );

      // Invalidate old session
      oldSession.isActive = false;

      return newSession;
    },

    /**
     * Terminate Session
     */
    terminateSession: (sessionId: string): void => {
      const session = sessionStore.get(sessionId);
      if (session) {
        session.isActive = false;
      }
    },

    /**
     * Get Active Sessions for User
     */
    getActiveSessions: (userId: number): Session[] => {
      return Array.from(sessionStore.values()).filter(
        (s) => s.userId === userId && s.isActive && Date.now() <= s.expiresAt
      );
    },

    /**
     * Terminate All Sessions for User (for security incidents)
     */
    terminateAllSessions: (userId: number): void => {
      sessionStore.forEach((session) => {
        if (session.userId === userId) {
          session.isActive = false;
        }
      });
    },
  };
};

// ============ CONSENT MANAGEMENT ============

/**
 * User Consent Manager
 * Tracks which scopes users have authorized for each client
 */
export interface UserConsent {
  userId: number;
  clientId: number;
  scopes: string[];
  grantedAt: number;
  expiresAt: number;
  isRevoked: boolean;
}

export const createConsentManager = () => {
  const consentStore = new Map<string, UserConsent>();

  return {
    /**
     * Grant Consent
     * User authorizes client to access specific scopes
     */
    grantConsent: (userId: number, clientId: number, scopes: string[], expiryDays: number = 365): UserConsent => {
      const key = `${userId}:${clientId}`;
      const now = Date.now();

      const consent: UserConsent = {
        userId,
        clientId,
        scopes,
        grantedAt: now,
        expiresAt: now + expiryDays * 24 * 3600 * 1000,
        isRevoked: false,
      };

      consentStore.set(key, consent);

      return consent;
    },

    /**
     * Check Consent
     */
    checkConsent: (userId: number, clientId: number, requestedScopes: string[]): boolean => {
      const key = `${userId}:${clientId}`;
      const consent = consentStore.get(key);

      if (!consent || consent.isRevoked) {
        return false;
      }

      if (Date.now() > consent.expiresAt) {
        return false;
      }

      // Check if all requested scopes are granted
      return requestedScopes.every((scope) => consent.scopes.includes(scope));
    },

    /**
     * Revoke Consent
     */
    revokeConsent: (userId: number, clientId: number): void => {
      const key = `${userId}:${clientId}`;
      const consent = consentStore.get(key);
      if (consent) {
        consent.isRevoked = true;
      }
    },

    /**
     * Get User Consents
     */
    getUserConsents: (userId: number): UserConsent[] => {
      return Array.from(consentStore.values()).filter(
        (c) => c.userId === userId && !c.isRevoked && Date.now() <= c.expiresAt
      );
    },
  };
};

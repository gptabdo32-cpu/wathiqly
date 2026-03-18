/**
 * Comprehensive Liveness Detection Test Suite
 * Tests for Interactive Liveness Detection system
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createLivenessSession,
  generateRandomChallenges,
  calculateComprehensiveRiskScore,
  validateLivenessResult,
  ChallengeType,
  LivenessAnalysisResult,
} from "./_core/livenessDetection";

describe("Liveness Detection Core Module", () => {
  describe("Challenge Generation", () => {
    it("should generate random challenges without duplicates", () => {
      const challenges = generateRandomChallenges(3);
      expect(challenges).toHaveLength(3);
      expect(new Set(challenges).size).toBe(3);
    });

    it("should not exceed available challenge types", () => {
      const allChallenges = Object.values(ChallengeType);
      const challenges = generateRandomChallenges(10);
      expect(challenges.length).toBeLessThanOrEqual(allChallenges.length);
    });

    it("should return valid challenge types", () => {
      const challenges = generateRandomChallenges(3);
      const validTypes = Object.values(ChallengeType);
      challenges.forEach((challenge) => {
        expect(validTypes).toContain(challenge);
      });
    });
  });

  describe("Session Creation", () => {
    it("should create a valid liveness session", () => {
      const config = {
        userId: 1,
        challengeCount: 3,
        videoDurationMs: 60000,
        minLivenessScore: 75,
        maxRiskScore: 25,
      };

      const session = createLivenessSession(config);

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).toHaveLength(21); // nanoid default length
      expect(session.challenges).toHaveLength(3);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should generate unique session IDs", () => {
      const config = {
        userId: 1,
        challengeCount: 3,
        videoDurationMs: 60000,
        minLivenessScore: 75,
        maxRiskScore: 25,
      };

      const session1 = createLivenessSession(config);
      const session2 = createLivenessSession(config);

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it("should set correct expiration time", () => {
      const config = {
        userId: 1,
        challengeCount: 3,
        videoDurationMs: 60000,
        minLivenessScore: 75,
        maxRiskScore: 25,
      };

      const session = createLivenessSession(config);
      const expirationTime = session.expiresAt.getTime() - Date.now();

      // Should expire in approximately 5 minutes (300000ms)
      expect(expirationTime).toBeGreaterThan(290000);
      expect(expirationTime).toBeLessThan(310000);
    });
  });

  describe("Risk Score Calculation", () => {
    it("should calculate comprehensive risk score correctly", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 85,
        riskScore: 15,
        isLive: true,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
          { challenge: ChallengeType.SMILE, detected: true, confidence: 85, details: {} },
          { challenge: ChallengeType.HEAD_NOD, detected: true, confidence: 80, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const riskScore = calculateComprehensiveRiskScore(result);

      expect(riskScore).toBeGreaterThanOrEqual(0);
      expect(riskScore).toBeLessThanOrEqual(100);
      expect(riskScore).toBe(15); // No failed challenges or attacks
    });

    it("should increase risk score for failed challenges", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 60,
        riskScore: 40,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
          { challenge: ChallengeType.SMILE, detected: false, confidence: 30, details: {} },
          { challenge: ChallengeType.HEAD_NOD, detected: false, confidence: 20, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const riskScore = calculateComprehensiveRiskScore(result);

      // 40 (base) + 20 (2 failed challenges * 10) = 60
      expect(riskScore).toBeGreaterThan(40);
    });

    it("should increase risk score for presentation attacks", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 50,
        riskScore: 50,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
        ],
        presentationAttackDetected: true,
        presentationAttackType: "deepfake",
        presentationAttackProbability: 0.8,
        warnings: ["Presentation attack detected: deepfake"],
        timestamp: Date.now(),
      };

      const riskScore = calculateComprehensiveRiskScore(result);

      // 50 (base) + 40 (0.8 * 50) = 90
      expect(riskScore).toBeGreaterThan(50);
      expect(riskScore).toBeLessThanOrEqual(100);
    });

    it("should increase risk score for low liveness scores", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 50,
        riskScore: 30,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 50, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const riskScore = calculateComprehensiveRiskScore(result);

      // 30 (base) + 5 (60 - 50) * 0.5 = 35
      expect(riskScore).toBeGreaterThan(30);
    });
  });

  describe("Result Validation", () => {
    it("should validate successful liveness result", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 85,
        riskScore: 15,
        isLive: true,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
          { challenge: ChallengeType.SMILE, detected: true, confidence: 85, details: {} },
          { challenge: ChallengeType.HEAD_NOD, detected: true, confidence: 80, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const validation = validateLivenessResult(result);

      expect(validation.isValid).toBe(true);
      expect(validation.reasons).toHaveLength(0);
    });

    it("should reject result with low liveness score", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 60,
        riskScore: 20,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 60, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const validation = validateLivenessResult(result);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons).toContain(
        expect.stringContaining("Liveness score")
      );
    });

    it("should reject result with high risk score", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 80,
        riskScore: 50,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const validation = validateLivenessResult(result);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons).toContain(
        expect.stringContaining("Risk score")
      );
    });

    it("should reject result with presentation attack", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 85,
        riskScore: 15,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
        ],
        presentationAttackDetected: true,
        presentationAttackType: "mask",
        warnings: ["Presentation attack detected: mask"],
        timestamp: Date.now(),
      };

      const validation = validateLivenessResult(result);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons).toContain(
        expect.stringContaining("Presentation attack")
      );
    });

    it("should reject result with failed challenges", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 80,
        riskScore: 20,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 90, details: {} },
          { challenge: ChallengeType.SMILE, detected: false, confidence: 30, details: {} },
          { challenge: ChallengeType.HEAD_NOD, detected: false, confidence: 20, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const validation = validateLivenessResult(result);

      expect(validation.isValid).toBe(false);
      expect(validation.reasons).toContain(
        expect.stringContaining("Failed challenges")
      );
    });

    it("should support custom validation thresholds", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 70,
        riskScore: 30,
        isLive: false,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 70, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      // With default thresholds (75, 25)
      const validationDefault = validateLivenessResult(result);
      expect(validationDefault.isValid).toBe(false);

      // With custom thresholds (60, 40)
      const validationCustom = validateLivenessResult(result, 60, 40);
      expect(validationCustom.isValid).toBe(true);
    });
  });

  describe("Challenge Type Enum", () => {
    it("should have all required challenge types", () => {
      const requiredChallenges = [
        "eye_blink",
        "smile",
        "head_turn_left",
        "head_turn_right",
        "head_nod",
        "look_up",
      ];

      requiredChallenges.forEach((challenge) => {
        expect(Object.values(ChallengeType)).toContain(challenge);
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle empty challenges array", () => {
      const challenges = generateRandomChallenges(0);
      expect(challenges).toHaveLength(0);
    });

    it("should handle validation with no warnings", () => {
      const result: LivenessAnalysisResult = {
        sessionId: "test-session",
        livenessScore: 90,
        riskScore: 10,
        isLive: true,
        challenges: [
          { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 95, details: {} },
        ],
        presentationAttackDetected: false,
        warnings: [],
        timestamp: Date.now(),
      };

      const validation = validateLivenessResult(result);
      expect(validation.reasons).toHaveLength(0);
    });
  });
});

describe("Liveness Detection Integration", () => {
  it("should create session and validate result workflow", () => {
    // Create session
    const config = {
      userId: 1,
      challengeCount: 3,
      videoDurationMs: 60000,
      minLivenessScore: 75,
      maxRiskScore: 25,
    };

    const session = createLivenessSession(config);
    expect(session.sessionId).toBeDefined();
    expect(session.challenges).toHaveLength(3);

    // Simulate successful analysis result
    const analysisResult: LivenessAnalysisResult = {
      sessionId: session.sessionId,
      livenessScore: 88,
      riskScore: 12,
      isLive: true,
      challenges: session.challenges.map((challenge) => ({
        challenge,
        detected: true,
        confidence: 85 + Math.random() * 15,
        details: {},
      })),
      presentationAttackDetected: false,
      warnings: [],
      timestamp: Date.now(),
    };

    // Calculate risk score
    const riskScore = calculateComprehensiveRiskScore(analysisResult);
    expect(riskScore).toBeLessThanOrEqual(25);

    // Validate result
    const validation = validateLivenessResult(analysisResult);
    expect(validation.isValid).toBe(true);
  });
});

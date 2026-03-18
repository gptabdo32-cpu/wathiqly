/**
 * Liveness Detection tRPC Router
 * Handles interactive liveness detection endpoints
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createLivenessSession,
  getLivenessSession,
  updateLivenessSession,
  getUserLivenessSessions,
  insertLivenessAnalysisResult,
  insertPresentationAttackLog,
  markUserLivenessVerified,
  incrementFailedLivenessAttempts,
  getUserLivenessStats,
} from "../db_liveness";
import {
  createLivenessSession as generateSession,
  analyzeVideoForLiveness,
  calculateComprehensiveRiskScore,
  validateLivenessResult,
  ChallengeType,
} from "../_core/livenessDetection";

export const livenessRouter = router({
  /**
   * Start a new liveness detection session
   */
  startSession: protectedProcedure
    .input(
      z.object({
        challengeCount: z.number().min(1).max(6).default(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;

      // Generate session
      const sessionConfig = {
        userId: user.id,
        challengeCount: input.challengeCount,
        videoDurationMs: 60000, // 60 seconds
        minLivenessScore: 75,
        maxRiskScore: 25,
      };

      const sessionData = generateSession(sessionConfig);

      // Save to database
      const session = await createLivenessSession({
        userId: user.id,
        sessionId: sessionData.sessionId,
        status: "in_progress",
        challenges: JSON.stringify(sessionData.challenges),
        completedChallenges: JSON.stringify([]),
        startedAt: new Date(),
      });

      return {
        sessionId: session.sessionId,
        challenges: sessionData.challenges,
        expiresAt: sessionData.expiresAt,
        message: "Liveness detection session started",
      };
    }),

  /**
   * Submit video for liveness analysis
   */
  submitVideo: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        videoUrl: z.string().url(),
        videoDuration: z.number().min(1000).max(120000), // 1-120 seconds
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { sessionId, videoUrl, videoDuration } = input;

      // Get session
      const session = await getLivenessSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Liveness session not found",
        });
      }

      // Verify session belongs to user
      if (session.userId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Session does not belong to this user",
        });
      }

      // Check session status
      if (session.status !== "in_progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Session is ${session.status}, cannot submit video`,
        });
      }

      // Update session with video info
      await updateLivenessSession(sessionId, {
        videoUrl,
        videoDuration,
      });

      // Analyze video
      const challenges = JSON.parse(session.challenges) as ChallengeType[];
      let analysisResult;

      try {
        analysisResult = await analyzeVideoForLiveness(videoUrl, challenges);
        analysisResult.sessionId = sessionId;
      } catch (error) {
        // Mark session as failed
        await updateLivenessSession(sessionId, {
          status: "failed",
          completedAt: new Date(),
        });

        // Log error for debugging
        console.error("[Liveness] Video analysis failed:", error);

        // Return more specific error message
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error
            ? `Failed to analyze video: ${error.message}`
            : "Failed to analyze video for liveness detection",
        });
      }

      // Calculate comprehensive risk score
      const comprehensiveRiskScore = calculateComprehensiveRiskScore(analysisResult);

      // Validate result
      const validation = validateLivenessResult(analysisResult);

      // Update session with results
      await updateLivenessSession(sessionId, {
        livenessScore: analysisResult.livenessScore,
        riskScore: comprehensiveRiskScore,
        isLive: validation.isValid,
        analysisResults: JSON.stringify(analysisResult),
        status: "completed",
        completedAt: new Date(),
      });

      // Store presentation attack log
      if (analysisResult.presentationAttackDetected) {
        await insertPresentationAttackLog({
          sessionId,
          printAttackDetected:
            analysisResult.presentationAttackType === "print",
          videoReplayDetected:
            analysisResult.presentationAttackType === "video",
          maskAttackDetected: analysisResult.presentationAttackType === "mask",
          deepfakeDetected:
            analysisResult.presentationAttackType === "deepfake",
          injectionAttackDetected:
            analysisResult.presentationAttackType === "injection",
          overallRiskScore: comprehensiveRiskScore,
          isPresentationAttack: true,
          confidence: analysisResult.presentationAttackProbability || 0,
        });
      }

      // Update user liveness status
      if (validation.isValid) {
        await markUserLivenessVerified(
          user.id,
          sessionId,
          analysisResult.livenessScore
        );
      } else {
        await incrementFailedLivenessAttempts(user.id);
      }

      return {
        sessionId,
        success: validation.isValid,
        livenessScore: analysisResult.livenessScore,
        riskScore: comprehensiveRiskScore,
        isLive: validation.isValid,
        challenges: analysisResult.challenges,
        presentationAttackDetected: analysisResult.presentationAttackDetected,
        presentationAttackType: analysisResult.presentationAttackType,
        warnings: validation.reasons,
        message: validation.isValid
          ? "Liveness verification successful!"
          : `Liveness verification failed: ${validation.reasons.join(", ")}`,
      };
    }),

  /**
   * Get session status
   */
  getSessionStatus: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const { sessionId } = input;

      const session = await getLivenessSession(sessionId);
      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      if (session.userId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Session does not belong to this user",
        });
      }

      return {
        sessionId: session.sessionId,
        status: session.status,
        challenges: JSON.parse(session.challenges),
        livenessScore: session.livenessScore,
        riskScore: session.riskScore,
        isLive: session.isLive,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      };
    }),

  /**
   * Get user's liveness history
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx;

      const sessions = await getUserLivenessSessions(user.id, input.limit);

      return sessions.map((s) => ({
        sessionId: s.sessionId,
        status: s.status,
        livenessScore: s.livenessScore,
        riskScore: s.riskScore,
        isLive: s.isLive,
        completedAt: s.completedAt,
        createdAt: s.createdAt,
      }));
    }),

  /**
   * Get user's liveness statistics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;

    const stats = await getUserLivenessStats(user.id);

    return {
      totalSessions: stats.totalSessions,
      completedSessions: stats.completedSessions,
      successfulSessions: stats.successfulSessions,
      successRate: stats.successRate,
      avgLivenessScore: stats.avgLivenessScore,
      avgRiskScore: stats.avgRiskScore,
      lastVerifiedAt: stats.lastVerifiedAt,
    };
  }),

  /**
   * Get current user's liveness status
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;

    const stats = await getUserLivenessStats(user.id);
    const sessions = await getUserLivenessSessions(user.id, 1);
    const lastSession = sessions[0];

    return {
      isVerified: stats.successfulSessions > 0,
      lastVerifiedAt: stats.lastVerifiedAt,
      lastSessionStatus: lastSession?.status,
      lastSessionScore: lastSession?.livenessScore,
      successRate: stats.successRate,
      totalAttempts: stats.completedSessions,
    };
  }),
});

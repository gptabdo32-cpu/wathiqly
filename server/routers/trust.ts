import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { 
  updateTrustScore, 
  getUserTrustData 
} from "../trust_logic";
import { 
  updatePredictiveTrustScore,
  generateAiPredictiveInsight,
  recordUserMetric,
  getDecryptedPredictiveProfile
} from "../predictive_trust_logic";
import { getDb } from "../db";
import { 
  trustScoreHistory, 
  userBadges, 
  reviews, 
  escrows,
  predictiveTrustProfiles,
  userActivityMetrics
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Enhanced Trust Router with RBAC (Role-Based Access Control)
 * and Secure Data Handling for Predictive Trust
 */

export const trustRouter = router({
  /**
   * Get trust score and badges for a specific user
   * Public data only (No sensitive AI insights)
   */
  getTrustProfile: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      try {
        const trustData = await getUserTrustData(input.userId);
        if (!trustData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User trust data not found",
          });
        }
        return trustData;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch trust profile",
        });
      }
    }),

  /**
   * Get Full Predictive Profile (Admin Only or Self-Service)
   * Includes decrypted AI behavioral analysis and risk factors
   */
  getPredictiveInsights: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;
      
      // Security Check: Only admins can view others' predictive insights
      if (input.userId && input.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Access Denied: Insufficient permissions to view predictive insights" 
        });
      }

      try {
        const profile = await getDecryptedPredictiveProfile(targetUserId);
        if (!profile) {
          return { status: "pending", message: "AI analysis in progress or not yet triggered" };
        }
        return profile;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve decrypted predictive insights",
        });
      }
    }),

  /**
   * Request an AI-powered predictive trust update (Manual or triggered)
   * Implements Rate Limiting and Permission Checks
   */
  refreshPredictiveScore: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const targetUserId = input.userId || ctx.user.id;
      
      // Security Check: Only admins can refresh others' scores
      if (input.userId && input.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can refresh other users' scores" });
      }

      try {
        // 1. First get standard score
        const historicalScore = await updateTrustScore(targetUserId, "predictive_refresh_trigger");
        
        // 2. Then apply AI predictive layer (Logic handles internal cooldown)
        const finalScore = await updatePredictiveTrustScore(targetUserId, historicalScore);
        
        return { success: true, newScore: finalScore };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to refresh predictive score",
        });
      }
    }),

  /**
   * Get trust score history for the current user
   */
  getScoreHistory: protectedProcedure
    .input(z.object({ 
      limit: z.number().default(20),
      offset: z.number().default(0)
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return await db
        .select()
        .from(trustScoreHistory)
        .where(eq(trustScoreHistory.userId, ctx.user.id))
        .orderBy(desc(trustScoreHistory.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Submit a verified review after a transaction
   * Triggers an automated predictive recalculation
   */
  submitVerifiedReview: protectedProcedure
    .input(z.object({
      escrowId: z.number(),
      rating: z.number().min(1).max(5),
      comment: z.string().max(500).optional(),
      reviewType: z.enum(["seller", "buyer"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // 1. Verify transaction status and user participation
      const [escrow] = await db.select().from(escrows).where(eq(escrows.id, input.escrowId)).limit(1);
      
      if (!escrow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      }

      if (escrow.status !== "completed") {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Reviews can only be submitted for completed transactions" 
        });
      }

      // Check if user is part of the transaction
      const isBuyer = escrow.buyerId === ctx.user.id;
      const isSeller = escrow.sellerId === ctx.user.id;

      if (!isBuyer && !isSeller) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not part of this transaction" });
      }

      // Ensure review type matches user role
      if (isBuyer && input.reviewType !== "seller") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Buyers can only review sellers" });
      }
      if (isSeller && input.reviewType !== "buyer") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sellers can only review buyers" });
      }

      // 2. Check if review already exists
      const [existingReview] = await db.select().from(reviews).where(
        and(
          eq(reviews.escrowId, input.escrowId),
          eq(reviews.reviewerId, ctx.user.id),
          eq(reviews.reviewType, input.reviewType)
        )
      ).limit(1);

      if (existingReview) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You have already reviewed this transaction" });
      }

      // 3. Insert review and update trust score
      const revieweeId = input.reviewType === "seller" ? escrow.sellerId : escrow.buyerId;

      try {
        await db.transaction(async (tx) => {
          await tx.insert(reviews).values({
            reviewerId: ctx.user.id,
            revieweeId: revieweeId,
            escrowId: input.escrowId,
            rating: input.rating,
            comment: input.comment,
            reviewType: input.reviewType,
          });

          // Trigger trust score update for the reviewee
          const historicalScore = await updateTrustScore(revieweeId, "new_review_received", { id: input.escrowId, type: "escrow" });
          
          // Apply predictive layer (Hybrid recalculation)
          await updatePredictiveTrustScore(revieweeId, historicalScore);
          
          // Also update for the reviewer (participation bonus)
          const reviewerHistoricalScore = await updateTrustScore(ctx.user.id, "review_submitted", { id: input.escrowId, type: "escrow" });
          await updatePredictiveTrustScore(ctx.user.id, reviewerHistoricalScore);
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit review",
        });
      }
    }),

  /**
   * Log a user activity metric (Behavioral Tracking)
   * Used for training the AI predictive model
   */
  logActivityMetric: protectedProcedure
    .input(z.object({
      type: z.enum(["response_time", "login_frequency", "transaction_speed", "dispute_rate", "profile_completeness"]),
      value: z.number(),
      metadata: z.any().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await recordUserMetric(ctx.user.id, input.type, input.value, input.metadata);
        return { success: true };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to log metric" });
      }
    }),
});

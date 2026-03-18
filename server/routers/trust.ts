import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { 
  updateTrustScore, 
  getUserTrustData 
} from "../trust_logic";
import { getDb } from "../db";
import { 
  trustScoreHistory, 
  userBadges, 
  reviews, 
  escrows 
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const trustRouter = router({
  /**
   * Get trust score and badges for a specific user
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
          await updateTrustScore(revieweeId, "new_review_received", { id: input.escrowId, type: "escrow" });
          
          // Also update for the reviewer (participation bonus)
          await updateTrustScore(ctx.user.id, "review_submitted", { id: input.escrowId, type: "escrow" });
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
   * Get badges for a user
   */
  getUserBadges: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return await db
        .select()
        .from(userBadges)
        .where(and(eq(userBadges.userId, input.userId), eq(userBadges.isActive, true)));
    }),
});

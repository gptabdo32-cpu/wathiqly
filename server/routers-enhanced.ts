import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./core/cookies";
import { systemRouter } from "./core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  validateUserAccess,
  validateFinancialAmount,
  validatePhoneNumber,
  validateEmail,
  detectSuspiciousActivity,
} from "./core/middleware";
import {
  processEscrowCompletion,
  addDisputeMessage,
  getDisputeMessages,
  uploadDisputeEvidence,
  createNotification,
  getUnreadNotifications,
  markNotificationAsRead,
  createFinancialTransaction,
} from "./db-enhanced";
import { getDb } from "./db";
import { eq, desc } from "drizzle-orm";
import { escrows, notifications, users } from "../drizzle/schema";

/**
 * Enhanced routers with security, dispute management, and real-time notifications
 */
export const enhancedRouter = router({
  // ============ DISPUTE MANAGEMENT ============
  dispute: router({
    /**
     * Raise a dispute for an escrow transaction
     */
    raiseDispute: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          reason: z.string().min(10).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Verify user is part of the transaction
        const escrow = await db.query.escrows.findFirst({
          where: eq(escrows.id, input.escrowId),
        });

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not part of this transaction",
          });
        }

        // Update escrow status to disputed
        await db.update(escrows).set({
          status: "disputed",
          disputeReason: input.reason,
          disputeRaisedBy: ctx.user.id,
          disputeRaisedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(escrows.id, input.escrowId));

        // Notify the other party
        const otherUserId = escrow.buyerId === ctx.user.id ? escrow.sellerId : escrow.buyerId;
        await createNotification(
          otherUserId,
          "dispute",
          "نزاع جديد",
          `تم رفع نزاع بخصوص المعاملة: ${escrow.title}`,
          `/dashboard/transactions/${input.escrowId}`
        );

        return { success: true };
      }),

    /**
     * Add message to dispute conversation
     */
    addMessage: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          message: z.string().min(1).max(5000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Verify user is part of the transaction
        const escrow = await db.query.escrows.findFirst({
          where: eq(escrows.id, input.escrowId),
        });

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not part of this transaction",
          });
        }

        // Add message (encrypted for sensitive content)
        await addDisputeMessage(input.escrowId, ctx.user.id, input.message, false);

        // Notify the other party
        const otherUserId = escrow.buyerId === ctx.user.id ? escrow.sellerId : escrow.buyerId;
        await createNotification(
          otherUserId,
          "dispute",
          "رسالة جديدة في النزاع",
          "لديك رسالة جديدة في النزاع",
          `/dashboard/disputes/${input.escrowId}`
        );

        return { success: true };
      }),

    /**
     * Get dispute conversation messages
     */
    getMessages: protectedProcedure
      .input(z.object({ escrowId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Verify user is part of the transaction
        const escrow = await db.query.escrows.findFirst({
          where: eq(escrows.id, input.escrowId),
        });

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not part of this transaction",
          });
        }

        return await getDisputeMessages(input.escrowId);
      }),

    /**
     * Upload evidence for dispute
     */
    uploadEvidence: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          fileUrl: z.string().url(),
          fileType: z.enum(["image", "video", "document"]),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Verify user is part of the transaction
        const escrow = await db.query.escrows.findFirst({
          where: eq(escrows.id, input.escrowId),
        });

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not part of this transaction",
          });
        }

        await uploadDisputeEvidence(
          input.escrowId,
          ctx.user.id,
          input.fileUrl,
          input.fileType,
          input.description
        );

        return { success: true };
      }),
  }),

  // ============ NOTIFICATIONS ============
  notifications: router({
    /**
     * Get unread notifications
     */
    getUnread: protectedProcedure.query(async ({ ctx }) => {
      return await getUnreadNotifications(ctx.user.id);
    }),

    /**
     * Mark notification as read
     */
    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Verify notification belongs to user
        const notification = await db.query.notifications.findFirst({
          where: eq(notifications.id, input.notificationId),
        });

        if (!notification) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notification not found",
          });
        }

        if (notification.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This notification does not belong to you",
          });
        }

        await markNotificationAsRead(input.notificationId);
        return { success: true };
      }),

    /**
     * Get all notifications with pagination
     */
    getAll: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        return await db.query.notifications.findMany({
          where: eq(notifications.userId, ctx.user.id),
          limit: input.limit,
          offset: input.offset,
          orderBy: (notifications) => [desc(notifications.createdAt)],
        });
      }),
  }),

  // ============ KYC (KNOW YOUR CUSTOMER) ============
  kyc: router({
    /**
     * Upload identity document
     */
    uploadIdentityDocument: protectedProcedure
      .input(
        z.object({
          documentUrl: z.string().url(),
          documentType: z.enum(["passport", "national_id", "driver_license"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Update user with identity document URL
        await db.update(users).set({
          identityDocumentUrl: input.documentUrl,
          kycStatus: "pending",
          updatedAt: new Date(),
        }).where(eq(users.id, ctx.user.id));

        // Create notification for admin to verify
        await createNotification(
          ctx.user.id,
          "system",
          "تم استلام المستند",
          "تم استلام مستند الهوية الخاص بك. سيتم التحقق منه خلال 24 ساعة.",
          "/dashboard/kyc"
        );

        return { success: true };
      }),

    /**
     * Verify phone number with OTP
     */
    verifyPhoneNumber: protectedProcedure
      .input(
        z.object({
          phoneNumber: z.string().refine(validatePhoneNumber, {
            message: "Invalid Libyan phone number format",
          }),
          otp: z.string().length(6),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // In production, verify OTP against sent SMS
        // SECURITY: Implement proper OTP verification logic here
        // For development/demo, we allow 123456 but this should be integrated with an SMS provider
        const isValidOtp = process.env.NODE_ENV === "development" ? input.otp === "123456" : false;
        
        if (!isValidOtp) {
           throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired OTP" });
        }

        await db.update(users).set({
          phone: input.phoneNumber,
          isPhoneVerified: true,
          phoneNumberVerifiedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(users.id, ctx.user.id));

        return { success: true };
      }),

    /**
     * Get KYC status
     */
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return {
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        isIdentityVerified: user.isIdentityVerified,
        identityDocumentUrl: user.identityDocumentUrl,
        kycScore: calculateKYCScore(user),
      };
    }),
  }),

  // ============ ENHANCED ESCROW WITH ATOMIC TRANSACTIONS ============
  escrowEnhanced: router({
    /**
     * Complete escrow with atomic transaction
     */
    completeTransaction: protectedProcedure
      .input(z.object({ escrowId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const escrow = await db.query.escrows.findFirst({
          where: eq(escrows.id, input.escrowId),
        });

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the buyer can complete the transaction",
          });
        }

        // Process escrow completion with atomic transaction
        const result = await processEscrowCompletion(input.escrowId);

        // Notify seller
        await createNotification(
          escrow.sellerId,
          "transaction",
          "تم استلام المبلغ",
          `تم استلام المبلغ من المشتري. ${result.sellerAmount} د.ل`,
          `/dashboard/transactions/${input.escrowId}`
        );

        return { success: true, ...result };
      }),
  }),
});

/**
 * Helper function to calculate KYC score
 */
function calculateKYCScore(user: any): number {
  let score = 0;

  if (user.isEmailVerified) score += 25;
  if (user.isPhoneVerified) score += 25;
  if (user.isIdentityVerified) score += 50;

  return score;
}

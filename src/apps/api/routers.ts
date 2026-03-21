import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./core/cookies";
import { systemRouter } from "./core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Decimal } from "decimal.js";
import { eq, desc, and, or } from "drizzle-orm";
import {
  getOrCreateWallet,
  getUserById,
  createEscrow,
  getEscrowById,
  getUserEscrows,
  updateEscrowStatus,
  createDigitalProduct,
  getDigitalProductById,
  getSellerProducts,
  searchProducts,
  getFeaturedProducts,
  createReview,
  getUserReviews,
  hasCompletedTransaction,
  createWithdrawalRequest,
  getUserWithdrawals,
  getPendingWithdrawals,
  createTrustedSellerSubscription,
  getUserActiveTrustedSubscription,
  createTransaction,
  getUserTransactions,
  getWalletByUserId,
  updateUserProfile,
  getDb,
  createAuditLog,
  addDisputeMessage,
  getDisputeMessages,
  uploadDisputeEvidence,
  createNotification,
  getUnreadNotifications,
  markNotificationAsRead,
  processEscrowCompletion,
} from "./db";
import {
  users,
  wallets,
  transactions,
  escrows,
  notifications,
  depositRequests,
  withdrawalRequests,
  digitalProducts,
  physicalProducts,
  vehicles,
  services,
} from "../drizzle/schema";
import { createEscrowSchema } from "../../interface/api/schemas/createEscrow";

import { adminRouter } from "./core/admin";
import { verificationRouter } from "./core/verification";
import { paymentAdminRouter } from "./core/payment-admin";
import { walletIdEnhancedRouter } from "./core/wallet/wallet_id_enhanced";
import { smartEscrowRouter } from "./core/escrow/smartEscrow";
import { trustRouter } from "./core/trust";
import { escrowRouter } from "../../interface/api/escrowRouter";
import { createEncryptionManager } from "./core/security";
import { ENV } from "./core/env";
import { validatePhoneNumber } from "./core/middleware";

const encryptionManager = createEncryptionManager(ENV.encryptionKey!);

const COMMISSIONS: Record<string, number> = {
  phone_credit: 0.30,
  topup_card: 0.01,
  bank_transfer: 0.02,
  sadad: 0.01,
  tadawul: 0.01,
  edfaali: 0.01,
  cash: 0.00,
};

export const appRouter = router({
  system: systemRouter,
  paymentAdmin: paymentAdminRouter,
  walletId: walletIdEnhancedRouter,
  smartEscrow: smartEscrowRouter,
  trust: trustRouter,
  admin: adminRouter,
  verification: verificationRouter,
  escrow: escrowRouter,
  
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ============ USER PROFILE OPERATIONS ============
  user: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return await getUserById(ctx.user.id);
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).max(100).trim().optional(),
          bio: z.string().max(500).trim().optional(),
          city: z.string().max(100).trim().optional(),
          phone: z.string().regex(/^(\+218|0)(91|92|94|95)[0-9]{7}$/).optional(),
          profileImage: z.string().url().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, input);
        await createAuditLog({
          userId: ctx.user.id,
          action: "user_profile_update",
          entityType: "user",
          entityId: ctx.user.id,
          newValue: input,
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });
        return { success: true };
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      const wallet = await getWalletByUserId(ctx.user.id);
      const reviews = await getUserReviews(ctx.user.id, 1000);
      const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

      return {
        balance: wallet?.balance || "0",
        totalEarned: wallet?.totalEarned || "0",
        totalWithdrawn: wallet?.totalWithdrawn || "0",
        averageRating,
        totalReviews: reviews.length,
        isTrustedSeller: ctx.user.isTrustedSeller,
      };
    }),
  }),

  // ============ WALLET OPERATIONS ============
  wallet: router({
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      return await getOrCreateWallet(ctx.user.id);
    }),

    getTransactionHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
      .query(async ({ ctx, input }) => {
        return await getUserTransactions(ctx.user.id, input.limit, input.offset);
      }),

    requestDeposit: protectedProcedure
      .input(
        z.object({
          amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0),
          paymentMethod: z.enum(["phone_credit", "topup_card", "bank_transfer", "sadad", "tadawul", "edfaali", "cash"]),
          paymentDetails: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const commissionRate = COMMISSIONS[input.paymentMethod] || 0;
        const amount = new Decimal(input.amount);
        const convertedAmount = amount.minus(amount.mul(commissionRate)).toFixed(2);

        return await db.transaction(async (tx) => {
          const [result] = await tx.insert(depositRequests).values({
            userId: ctx.user.id,
            amount: input.amount,
            convertedAmount: convertedAmount,
            paymentMethod: input.paymentMethod,
            paymentDetails: encryptionManager.encrypt(JSON.stringify(input.paymentDetails)),
            status: "pending",
          });

          await tx.insert(transactions).values({
            userId: ctx.user.id,
            type: "deposit",
            amount: convertedAmount,
            status: "pending",
            description: `إيداع عبر ${input.paymentMethod} (المبلغ الأصلي: ${input.amount} د.ل)`,
            reference: `DEP-${result.insertId}`,
          } as any);

          await createAuditLog({
            userId: ctx.user.id,
            action: "deposit_request",
            entityType: "deposit",
            entityId: result.insertId,
            newValue: { amount: input.amount, method: input.paymentMethod },
          });

          return { success: true, depositId: result.insertId };
        });
      }),

    requestWithdrawal: protectedProcedure
      .input(
        z.object({
          amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0),
          paymentMethod: z.enum(["sadad", "tadawul", "edfaali", "bank_transfer"]),
          paymentDetails: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        return await db.transaction(async (tx) => {
          const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1).for("update");
          if (!wallet) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });

          const availableBalance = new Decimal(wallet.balance);
          const requestedAmount = new Decimal(input.amount);

          if (requestedAmount.gt(availableBalance)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
          }

          const newBalance = availableBalance.minus(requestedAmount).toFixed(2);
          const newPendingBalance = new Decimal(wallet.pendingBalance).plus(requestedAmount).toFixed(2);

          await tx.update(wallets).set({ balance: newBalance, pendingBalance: newPendingBalance, updatedAt: new Date() }).where(eq(wallets.id, wallet.id));

          const [result] = await tx.insert(withdrawalRequests).values({
            userId: ctx.user.id,
            amount: input.amount,
            paymentMethod: input.paymentMethod,
            paymentDetails: encryptionManager.encrypt(JSON.stringify(input.paymentDetails)),
            status: "pending",
          });

          await tx.insert(transactions).values({
            userId: ctx.user.id,
            type: "withdrawal",
            amount: input.amount,
            status: "pending",
            withdrawalRequestId: result.insertId,
            description: `Withdrawal request via ${input.paymentMethod}`,
          } as any);

          return { success: true, withdrawalId: result.insertId };
        });
      }),
  }),  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await getEscrowById(input.id);
    }),

    getUserEscrows: protectedProcedure
      .input(z.object({ limit: z.number().default(50), offset: z.number().default(0), status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return await getUserEscrows(ctx.user.id, input.limit, input.offset, input.status);
      }),

    confirmDelivery: protectedProcedure
      .input(z.object({ escrowId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.escrowId);
        if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        if (escrow.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the buyer can confirm delivery" });
        if (escrow.status !== "delivered") throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction must be in delivered status" });

        return await processEscrowCompletion(input.escrowId);
      }),
  }),

  // ============ DISPUTE MANAGEMENT ============
  dispute: router({
    raiseDispute: protectedProcedure
      .input(z.object({ escrowId: z.number(), reason: z.string().min(10).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const escrow = await db.query.escrows.findFirst({ where: eq(escrows.id, input.escrowId) });
        if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });

        await db.update(escrows).set({
          status: "disputed",
          disputeReason: input.reason,
          disputeRaisedBy: ctx.user.id,
          disputeRaisedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(escrows.id, input.escrowId));

        const otherUserId = escrow.buyerId === ctx.user.id ? escrow.sellerId : escrow.buyerId;
        await createNotification({
          userId: otherUserId,
          type: "dispute",
          title: "نزاع جديد",
          message: `تم رفع نزاع بخصوص المعاملة: ${escrow.title}`,
          link: `/dashboard/transactions/${input.escrowId}`
        } as any);

        return { success: true };
      }),

    addMessage: protectedProcedure
      .input(z.object({ escrowId: z.number(), message: z.string().min(1).max(5000) }))
      .mutation(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.escrowId);
        if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });

        await addDisputeMessage(input.escrowId, ctx.user.id, input.message, false);

        const otherUserId = escrow.buyerId === ctx.user.id ? escrow.sellerId : escrow.buyerId;
        await createNotification({
          userId: otherUserId,
          type: "dispute",
          title: "رسالة جديدة في النزاع",
          message: "لديك رسالة جديدة في النزاع",
          link: `/dashboard/disputes/${input.escrowId}`
        } as any);

        return { success: true };
      }),

    getMessages: protectedProcedure.input(z.object({ escrowId: z.number() })).query(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });

      return await getDisputeMessages(input.escrowId);
    }),

    uploadEvidence: protectedProcedure
      .input(z.object({ escrowId: z.number(), fileUrl: z.string().url(), fileType: z.enum(["image", "video", "document"]), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.escrowId);
        if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });

        await uploadDisputeEvidence(input.escrowId, ctx.user.id, input.fileUrl, input.fileType, input.description);
        return { success: true };
      }),
  }),

  // ============ NOTIFICATIONS ============
  notifications: router({
    getUnread: protectedProcedure.query(async ({ ctx }) => {
      return await getUnreadNotifications(ctx.user.id);
    }),

    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const notification = await db.query.notifications.findFirst({ where: eq(notifications.id, input.notificationId) });
        if (!notification) throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
        if (notification.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });

        await markNotificationAsRead(input.notificationId);
        return { success: true };
      }),

    getAll: protectedProcedure
      .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
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
    uploadIdentityDocument: protectedProcedure
      .input(z.object({ documentUrl: z.string().url(), documentType: z.enum(["passport", "national_id", "driver_license"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        await db.update(users).set({
          identityDocumentUrl: input.documentUrl,
          kycStatus: "pending",
          updatedAt: new Date(),
        }).where(eq(users.id, ctx.user.id));

        await createNotification({
          userId: ctx.user.id,
          type: "system",
          title: "تم استلام المستند",
          message: "تم استلام مستند الهوية الخاص بك. سيتم التحقق منه خلال 24 ساعة.",
          link: "/dashboard/kyc"
        } as any);

        return { success: true };
      }),

    verifyPhoneNumber: protectedProcedure
      .input(z.object({ phoneNumber: z.string().refine(validatePhoneNumber), otp: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        const isValidOtp = process.env.NODE_ENV === "development" ? input.otp === "123456" : false;
        if (!isValidOtp) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired OTP" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        await db.update(users).set({ phone: input.phoneNumber, phoneVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
        return { success: true };
      }),
  }),

  // ============ PRODUCTS OPERATIONS ============
  products: router({
    createProduct: protectedProcedure
      .input(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          category: z.string(),
          price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0),
          thumbnailUrl: z.string().optional(),
          previewUrl: z.string().optional(),
          deliveryType: z.enum(["instant", "manual", "email"]).default("manual"),
          productCodes: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createDigitalProduct({
          sellerId: ctx.user.id,
          title: input.title,
          description: input.description,
          category: input.category,
          price: input.price,
          thumbnailUrl: input.thumbnailUrl,
          previewUrl: input.previewUrl,
          deliveryType: input.deliveryType,
          productCodes: input.productCodes,
          isActive: true,
        });

        return { success: true, productId: result[0].insertId };
      }),

    getProduct: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await getDigitalProductById(input.id);
    }),

    searchProducts: publicProcedure
      .input(
        z.object({
          query: z.string(),
          category: z.string().optional(),
          type: z.enum(["digital", "physical", "vehicle", "service"]).default("digital"),
          limit: z.number().default(50),
          offset: z.number().default(0),
          filters: z.object({
            minPrice: z.string().optional(),
            maxPrice: z.string().optional(),
            city: z.string().optional(),
            condition: z.enum(["new", "used"]).optional(),
            sortBy: z.enum(["newest", "price-low", "price-high", "rating", "popular"]).optional(),
          }).optional(),
        })
      )
      .query(async ({ input }) => {
        return await searchProducts(input.query, input.category, input.type, input.limit, input.offset, input.filters);
      }),

    getFeatured: publicProcedure.query(async () => {
      return await getFeaturedProducts();
    }),
  }),
});

export type AppRouter = typeof appRouter;

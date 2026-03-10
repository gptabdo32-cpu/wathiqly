import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";

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
  createReview,
  getUserReviews,
  createWithdrawalRequest,
  getUserWithdrawals,
  getPendingWithdrawals,
  createTrustedSellerSubscription,
  getUserActiveTrustedSubscription,
  createTransaction,
  getUserTransactions,
  getWalletByUserId,
  updateUserProfile,
} from "./db";
import { adminRouter } from "./routers/admin";
import { encryptData } from "./_core/encryption";
import { chatRouter } from "./routers/chat";
import { eq } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
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
      const user = await getUserById(ctx.user.id);
      return user;
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).max(100).optional(),
          bio: z.string().max(500).optional(),
          city: z.string().max(100).optional(),
          phone: z.string().regex(/^(\+218|0)[0-9]{9}$/, "Invalid Libyan phone number format").optional(),
          profileImage: z.string().url().optional(),
          userType: z.enum(["buyer", "seller", "both"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await updateUserProfile(ctx.user.id, input);
          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update profile",
          });
        }
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      // Get user statistics
      const wallet = await getWalletByUserId(ctx.user.id);
      const reviews = await getUserReviews(ctx.user.id, 1000);

      const averageRating =
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

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
      const wallet = await getOrCreateWallet(ctx.user.id);
      return wallet;
    }),

    getTransactionHistory: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return await getUserTransactions(ctx.user.id, input.limit, input.offset);
      }),

    requestWithdrawal: protectedProcedure
      .input(
        z.object({
          amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, { message: "Amount must be a positive number" }),
          paymentMethod: z.enum(["sadad", "tadawul", "edfaali", "bank_transfer"]),
          paymentDetails: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          return await db.transaction(async (tx) => {
            // Get wallet with lock if possible (Drizzle doesn't support FOR UPDATE easily in all dialects, but transaction helps)
            const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1);
            
            if (!wallet) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
            }

            // Validate balance
            const availableBalance = parseFloat(wallet.balance);
            const requestedAmount = parseFloat(input.amount);

            if (requestedAmount > availableBalance) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Insufficient balance",
              });
            }

            // 1. Deduct from balance and move to pending
            const newBalance = (availableBalance - requestedAmount).toFixed(2);
            const newPendingBalance = (parseFloat(wallet.pendingBalance) + requestedAmount).toFixed(2);

            await tx.update(wallets)
              .set({ 
                balance: newBalance, 
                pendingBalance: newPendingBalance,
                updatedAt: new Date() 
              })
              .where(eq(wallets.id, wallet.id));

            // 2. Create withdrawal request
            const [result] = await tx.insert(withdrawalRequests).values({
              userId: ctx.user.id,
              amount: input.amount,
              paymentMethod: input.paymentMethod,
              paymentDetails: encryptData(JSON.stringify(input.paymentDetails)),
              status: "pending",
            });

            // 3. Create transaction record
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
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process withdrawal request",
          });
        }
      }),

    getWithdrawalHistory: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return await getUserWithdrawals(ctx.user.id, input.limit, input.offset);
      }),
  }),

  // ============ ADMIN OPERATIONS ============
  // Moved to admin router

  // ============ ESCROW OPERATIONS ============
  escrow: router({
    createTransaction: protectedProcedure
      .input(
        z.object({
          sellerId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, { message: "Amount must be a positive number" }),
          paymentMethod: z.enum(["sadad", "tadawul", "edfaali", "bank_transfer"]),
          commissionPercentage: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100, { message: "Commission percentage must be between 0 and 100" }).default("2.5"),
          dealType: z.enum(["physical", "digital_account", "service"]).default("physical"),
          specifications: z.record(z.string(), z.any()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify seller exists
        const seller = await getUserById(input.sellerId);
        if (!seller) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Seller not found",
          });
        }

        // Create escrow
        const commissionAmount = (
          parseFloat(input.amount) *
          (parseFloat(input.commissionPercentage) / 100)
        ).toFixed(2);

        const result = await createEscrow({
          buyerId: ctx.user.id,
          sellerId: input.sellerId,
          title: input.title,
          description: input.description,
          amount: input.amount,
          commissionPercentage: input.commissionPercentage,
          commissionAmount,
          commissionPaidBy: "buyer",
          dealType: input.dealType,
          specifications: input.specifications,
          status: "draft",
        });

        return { success: true, escrowId: result[0].insertId };
      }),

    getTransaction: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.id);

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        // Verify user is part of the transaction
        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this transaction",
          });
        }

        return escrow;
      }),

    listMyTransactions: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
          status: z.enum(["pending", "funded", "delivered", "completed", "cancelled", "disputed"]).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        let escrows = await getUserEscrows(ctx.user.id, input.limit, input.offset);

        if (input.status) {
          escrows = escrows.filter((e: any) => e.status === input.status);
        }

        return escrows;
      }),

    depositFunds: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          transactionProof: z.string(), // Reference or proof of payment
        })
      )
      .mutation(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.escrowId);

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the buyer can deposit funds",
          });
        }

        if (escrow.status !== "draft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction is not in draft status",
          });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          await db.transaction(async (tx) => {
            // Update escrow status to funded
            await tx.update(escrows).set({ status: "funded", fundedAt: new Date() }).where(eq(escrows.id, input.escrowId));

            // Create transaction record
            await tx.insert(transactions).values({
              userId: ctx.user.id,
              type: "deposit",
              amount: escrow.amount,
              status: "completed",
              escrowId: input.escrowId,
              description: `Escrow deposit for transaction ${input.escrowId}`,
              reference: input.transactionProof,
            } as any);
          });

          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process deposit",
          });
        }
      }),

    confirmDelivery: protectedProcedure
      .input(z.object({ escrowId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.escrowId);

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (escrow.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the buyer can confirm delivery",
          });
        }

        if (escrow.status !== "delivered") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction is not in delivered status",
          });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          await db.transaction(async (tx) => {
            // Update escrow status to completed
            await tx.update(escrows).set({ status: "completed", completedAt: new Date() }).where(eq(escrows.id, input.escrowId));

            // Calculate amount to release to seller (total - commission)
            const releaseAmount = (parseFloat(escrow.amount) - parseFloat(escrow.commissionAmount)).toFixed(2);

            // Update seller wallet
            const [sellerWallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.sellerId)).limit(1);
            if (sellerWallet) {
              const newBalance = (parseFloat(sellerWallet.balance) + parseFloat(releaseAmount)).toFixed(2);
              const newTotalEarned = (parseFloat(sellerWallet.totalEarned) + parseFloat(releaseAmount)).toFixed(2);
              await tx.update(wallets).set({ balance: newBalance, totalEarned: newTotalEarned }).where(eq(wallets.id, sellerWallet.id));
            } else {
              await tx.insert(wallets).values({
                userId: escrow.sellerId,
                balance: releaseAmount,
                totalEarned: releaseAmount,
                pendingBalance: "0",
                totalWithdrawn: "0"
              });
            }

            // Create transaction record for seller
            await tx.insert(transactions).values({
              userId: escrow.sellerId,
              type: "deposit",
              amount: releaseAmount,
              status: "completed",
              escrowId: input.escrowId,
              description: `Escrow release for transaction ${input.escrowId}`,
            } as any);
          });

          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to confirm delivery and release funds",
          });
        }
      }),

    raiseDispute: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          reason: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const escrow = await getEscrowById(input.escrowId);

        if (!escrow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        // Verify user is part of the transaction
        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this transaction",
          });
        }

        // Update escrow status to disputed
        await updateEscrowStatus(input.escrowId, "disputed");

        return { success: true };
      }),
  }),

  // ============ DIGITAL PRODUCTS OPERATIONS ============
  products: router({
    createProduct: protectedProcedure
      .input(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          category: z.string(),
          price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, { message: "Price must be a positive number" }),
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

    getProduct: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getDigitalProductById(input.id);
      }),

    getSellerProducts: publicProcedure
      .input(
        z.object({
          sellerId: z.number(),
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        return await getSellerProducts(input.sellerId, input.limit, input.offset);
      }),

    searchProducts: publicProcedure
      .input(
        z.object({
          query: z.string(),
          category: z.string().optional(),
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        return await searchProducts(input.query, input.category, input.limit, input.offset);
      }),
  }),

  // ============ REVIEWS OPERATIONS ============
  reviews: router({
    createReview: protectedProcedure
      .input(
        z.object({
          revieweeId: z.number(),
          rating: z.number().min(1).max(5),
          comment: z.string().optional(),
          escrowId: z.number().optional(),
          productPurchaseId: z.number().optional(),
          reviewType: z.enum(["seller", "buyer", "product"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createReview({
          revieweeId: input.revieweeId,
          reviewerId: ctx.user.id,
          rating: input.rating,
          comment: input.comment,
          escrowId: input.escrowId,
          productPurchaseId: input.productPurchaseId,
          reviewType: input.reviewType,
        } as any);

        return { success: true, reviewId: result[0].insertId };
      }),

    getUserReviews: publicProcedure
      .input(
        z.object({
          userId: z.number(),
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        return await getUserReviews(input.userId, input.limit, input.offset);
      }),
  }),



  // ============ TRUSTED SELLER OPERATIONS ============
  admin: adminRouter,
  trustedSeller: router({
    subscribeToPlan: protectedProcedure
      .input(
        z.object({
          planName: z.string(),
          monthlyPrice: z.string(),
          durationMonths: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Implement payment processing
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + input.durationMonths);

        const result = await createTrustedSellerSubscription({
          userId: ctx.user.id,
          planName: input.planName,
          monthlyPrice: input.monthlyPrice,
          startDate,
          endDate,
          isActive: true,
          autoRenew: true,
          benefits: ["featured_listing", "priority_support", "badge"],
        });

        return { success: true, subscriptionId: result[0].insertId };
      }),

    getActiveSubscription: protectedProcedure.query(async ({ ctx }) => {
      return await getUserActiveTrustedSubscription(ctx.user.id);
    }),
  }),

  // ============ CHAT OPERATIONS ============
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;

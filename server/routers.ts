import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { or } from "drizzle-orm";
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
  getAdminStats,
  getAllDisputes,
  resolveDispute,
  getSuspiciousActivities,
} from "./db";
import { adminRouter } from "./routers/admin";
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
          name: z.string().optional(),
          bio: z.string().optional(),
          city: z.string().optional(),
          phone: z.string().optional(),
          profileImage: z.string().optional(),
          userType: z.enum(["buyer", "seller", "both"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // TODO: Implement profile update in database
        return { success: true };
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
          paymentDetails: z.record(z.string(), z.any()), // TODO: Implement encryption for sensitive payment details before storing in production
        })
      )
      .mutation(async ({ ctx, input }) => {
        const wallet = await getOrCreateWallet(ctx.user.id);

        // Validate balance
        const availableBalance = parseFloat(wallet.balance);
        const requestedAmount = parseFloat(input.amount);

        if (requestedAmount > availableBalance) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient balance",
          });
        }

        // Create withdrawal request
        const result = await createWithdrawalRequest({
          userId: ctx.user.id,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentDetails: input.paymentDetails,
          status: "pending",
        });

        return { success: true, withdrawalId: result[0].insertId };
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
  admin: router({
    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return await getAdminStats();
    }),

    listDisputes: protectedProcedure
      .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        return await getAllDisputes(input.limit, input.offset);
      }),

    resolveDispute: protectedProcedure
      .input(z.object({ 
        escrowId: z.number(), 
        resolution: z.string(), 
        status: z.enum(["completed", "cancelled"]) 
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        await resolveDispute(input.escrowId, input.resolution, input.status);
        return { success: true };
      }),

    getSuspiciousActivities: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return await getSuspiciousActivities();
    }),
  }),

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
          paymentMethod: input.paymentMethod,
          status: "pending",
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

        if (escrow.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction is not in pending status",
          });
        }

        // Update status to funded
        await updateEscrowStatus(input.escrowId, "funded");

        // Create transaction record
        await createTransaction({
          userId: ctx.user.id,
          type: "deposit",
          amount: escrow.amount,
          referenceType: "escrow",
          referenceId: input.escrowId,
          status: "completed",
          description: `Deposit for escrow transaction: ${escrow.title}`,
        });

        return { success: true };
      }),

    confirmDelivery: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          deliveryProof: z.string(),
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

        if (escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the seller can confirm delivery",
          });
        }

        if (escrow.status !== "funded") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction is not in funded status",
          });
        }

        // Update status to delivered
        await updateEscrowStatus(input.escrowId, "delivered");

        return { success: true };
      }),

    confirmReceipt: protectedProcedure
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
            message: "Only the buyer can confirm receipt",
          });
        }

        if (escrow.status !== "delivered") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction is not in delivered status",
          });
        }

        // Update status to completed
        await updateEscrowStatus(input.escrowId, "completed");

        // Transfer funds to seller (minus commission)
        const sellerAmount = (
          parseFloat(escrow.amount) - parseFloat(escrow.commissionAmount)
        ).toFixed(2);

        // Create transaction for seller
        await createTransaction({
          userId: escrow.sellerId,
          type: "deposit",
          amount: sellerAmount,
          referenceType: "escrow",
          referenceId: input.escrowId,
          status: "completed",
          description: `Payment received for: ${escrow.title}`,
        });

        // Create transaction for commission
        await createTransaction({
          userId: 1, // Platform admin user
          type: "commission",
          amount: escrow.commissionAmount,
          referenceType: "escrow",
          referenceId: input.escrowId,
          status: "completed",
          description: `Commission from escrow: ${escrow.title}`,
        });

        return { success: true };
      }),
  }),

  // ============ DIGITAL PRODUCTS OPERATIONS ============
  products: router({
    createProduct: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          category: z.string(),
          price: z.string(),
          quantity: z.number(),
          image: z.string().optional(),
          deliveryType: z.enum(["instant", "manual", "email"]).default("manual"),
          productCodes: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify user is a seller
        if (ctx.user.userType !== "seller" && ctx.user.userType !== "both") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only sellers can create products",
          });
        }

        const result = await createDigitalProduct({
          sellerId: ctx.user.id,
          name: input.name,
          description: input.description,
          category: input.category,
          price: input.price,
          quantity: input.quantity,
          image: input.image,
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

    getMyProducts: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return await getSellerProducts(ctx.user.id, input.limit, input.offset);
      }),

    searchProducts: publicProcedure
      .input(
        z.object({
          query: z.string().optional(),
          category: z.string().optional(),
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ input }) => {
        return await searchProducts(input.query || "", input.category, input.limit, input.offset);
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
        });

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
  // ============ ADMIN OPERATIONS ============
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
});

export type AppRouter = typeof appRouter;

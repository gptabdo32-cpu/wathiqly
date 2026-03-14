import { COOKIE_NAME } from "@shared/const";
import { createAuditLog } from "./db-enhanced";
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
  getFeaturedProducts,
  getProductById,
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
} from "./db";
import { adminRouter } from "./routers/admin";
import { verificationRouter } from "./routers/verification";
import { encryptData } from "./_core/encryption";
import { Decimal } from "decimal.js";
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
          name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name too long").trim().optional(),
          bio: z.string().max(500, "Bio too long").trim().optional(),
          city: z.string().max(100, "City name too long").trim().optional(),
          phone: z.string().regex(/^(\+218|0)(91|92|94|95)[0-9]{7}$/, "Invalid Libyan mobile number format").optional(),
          profileImage: z.string().url("Invalid image URL").optional(),
          userType: z.enum(["buyer", "seller", "both"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
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

    requestDeposit: protectedProcedure
      .input(
        z.object({
          amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, { message: "Amount must be a positive number" }),
          convertedAmount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, { message: "Converted amount must be a positive number" }),
          paymentMethod: z.enum([
            "phone_credit",
            "topup_card",
            "bank_transfer",
            "sadad",
            "tadawul",
            "edfaali",
            "cash",
          ]),
          paymentDetails: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          return await db.transaction(async (tx) => {
            // 1. Create deposit request
            const [result] = await tx.insert(depositRequests).values({
              userId: ctx.user.id,
              amount: input.amount,
              convertedAmount: input.convertedAmount,
              paymentMethod: input.paymentMethod,
              paymentDetails: encryptData(JSON.stringify(input.paymentDetails)),
              status: "pending",
            });

            // 2. Create transaction record
            await tx.insert(transactions).values({
              userId: ctx.user.id,
              type: "deposit",
              amount: input.convertedAmount,
              status: "pending",
              description: `إيداع عبر ${input.paymentMethod} (المبلغ الأصلي: ${input.amount} د.ل)`,
              reference: `DEP-${result.insertId}`,
            } as any);

            // 3. For instant methods (SADAD, Edfaali, etc. in a real system would use a webhook)
            // For this project, we'll simulate success for certain methods if requested, 
            // but let's keep them pending as per user request for bank/cash.
            
            await createAuditLog({
              userId: ctx.user.id,
              action: "deposit_request",
              entityType: "deposit",
              entityId: result.insertId,
              newValue: { amount: input.amount, method: input.paymentMethod },
            });

            return { success: true, depositId: result.insertId };
          });
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to process deposit request",
          });
        }
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
            // Get wallet with FOR UPDATE lock to prevent race conditions
            const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1).for("update");
            
            if (!wallet) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
            }

            // Validate balance
            const availableBalance = new Decimal(wallet.balance);
            const requestedAmount = new Decimal(input.amount);

            if (requestedAmount.gt(availableBalance)) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Insufficient balance",
              });
            }

            // 1. Deduct from balance and move to pending
            const newBalance = availableBalance.minus(requestedAmount).toFixed(2);
            const newPendingBalance = new Decimal(wallet.pendingBalance).plus(requestedAmount).toFixed(2);

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

            const withdrawalResult = { success: true, withdrawalId: result.insertId };
            await createAuditLog({
              userId: ctx.user.id,
              action: "withdrawal_request",
              entityType: "wallet",
              entityId: wallet.id,
              newValue: { amount: input.amount, paymentMethod: input.paymentMethod, withdrawalId: result.insertId },
              ipAddress: ctx.req.ip,
              userAgent: ctx.req.headers["user-agent"],
            });
            return withdrawalResult;
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process withdrawal request",
          });
        }
      }),

    transfer: protectedProcedure
      .input(
        z.object({
          recipientEmail: z.string().email("Invalid recipient email"),
          amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, { message: "Amount must be a positive number" }),
          description: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          return await db.transaction(async (tx) => {
            // 1. Find recipient
            const [recipient] = await tx.select().from(users).where(eq(users.email, input.recipientEmail)).limit(1);
            if (!recipient) {
              throw new TRPCError({ code: "NOT_FOUND", message: "المستلم غير موجود" });
            }

            if (recipient.id === ctx.user.id) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك التحويل لنفسك" });
            }

            // 2. Get sender wallet with lock
            const [senderWallet] = await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1).for("update");
            if (!senderWallet) {
              throw new TRPCError({ code: "NOT_FOUND", message: "محفظة المرسل غير موجودة" });
            }

            // 3. Validate balance
            const amount = new Decimal(input.amount);
            if (new Decimal(senderWallet.balance).lt(amount)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "الرصيد غير كافٍ" });
            }

            // 4. Get or create recipient wallet
            let [recipientWallet] = await tx.select().from(wallets).where(eq(wallets.userId, recipient.id)).limit(1).for("update");
            if (!recipientWallet) {
              const [insertResult] = await tx.insert(wallets).values({
                userId: recipient.id,
                balance: "0",
                pendingBalance: "0",
                totalEarned: "0",
                totalWithdrawn: "0",
              });
              [recipientWallet] = await tx.select().from(wallets).where(eq(wallets.id, insertResult.insertId)).limit(1).for("update");
            }

            // 5. Update balances (No commission as requested)
            const newSenderBalance = new Decimal(senderWallet.balance).minus(amount).toFixed(2);
            const newRecipientBalance = new Decimal(recipientWallet.balance).plus(amount).toFixed(2);

            await tx.update(wallets).set({ balance: newSenderBalance, updatedAt: new Date() }).where(eq(wallets.id, senderWallet.id));
            await tx.update(wallets).set({ balance: newRecipientBalance, updatedAt: new Date() }).where(eq(wallets.id, recipientWallet.id));

            // 6. Create transaction records
            const transferDesc = input.description || `تحويل داخلي`;
            
            // Sender transaction (Debit)
            await tx.insert(transactions).values({
              userId: ctx.user.id,
              type: "transfer",
              amount: input.amount,
              status: "completed",
              description: `${transferDesc} إلى ${recipient.name || recipient.email}`,
            } as any);

            // Recipient transaction (Credit)
            await tx.insert(transactions).values({
              userId: recipient.id,
              type: "transfer",
              amount: input.amount,
              status: "completed",
              description: `${transferDesc} من ${ctx.user.name || ctx.user.email}`,
            } as any);

            await createAuditLog({
              userId: ctx.user.id,
              action: "internal_transfer",
              entityType: "wallet",
              entityId: senderWallet.id,
              newValue: { amount: input.amount, recipientId: recipient.id },
              ipAddress: ctx.req.ip,
              userAgent: ctx.req.headers["user-agent"],
            });

            return { success: true };
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "فشل في إتمام عملية التحويل",
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
        const commissionAmount = new Decimal(input.amount)
          .mul(new Decimal(input.commissionPercentage).div(100))
          .toFixed(2);

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
        // Optimization: Filtering at the database level is more efficient than in-memory filtering
        return await getUserEscrows(ctx.user.id, input.limit, input.offset, input.status);
      }),

    depositFunds: protectedProcedure
      .input(
        z.object({
          escrowId: z.number(),
          transactionProof: z.string(), // Reference or proof of payment
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          return await db.transaction(async (tx) => {
            // Lock the escrow row for update to prevent race conditions
            const [escrow] = await tx.select().from(escrows).where(eq(escrows.id, input.escrowId)).limit(1).for("update");

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
                message: `Transaction is in ${escrow.status} status, expected draft`,
              });
            }

            // Security: Change status to 'pending_verification' instead of 'funded' immediately
            // This allows admins to verify the transaction proof before the escrow is considered funded.
            await tx.update(escrows).set({ 
              status: "pending_verification", 
              updatedAt: new Date() 
            }).where(eq(escrows.id, input.escrowId));

            // Create transaction record as pending
            await tx.insert(transactions).values({
              userId: ctx.user.id,
              type: "deposit",
              amount: escrow.amount,
              status: "pending",
              escrowId: input.escrowId,
              description: `Escrow deposit proof submitted for transaction ${input.escrowId}`,
              reference: input.transactionProof,
            } as any);

            return { success: true };
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process deposit",
          });
        }
      }),

    confirmDelivery: protectedProcedure
      .input(z.object({ escrowId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        try {
          return await db.transaction(async (tx) => {
            // Lock the escrow row for update
            const [escrow] = await tx.select().from(escrows).where(eq(escrows.id, input.escrowId)).limit(1).for("update");

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
                message: `Transaction is in ${escrow.status} status, expected delivered`,
              });
            }

            // Update escrow status to completed
            await tx.update(escrows).set({ status: "completed", completedAt: new Date() }).where(eq(escrows.id, input.escrowId));

            // Calculate amount to release to seller (total - commission)
            const releaseAmount = new Decimal(escrow.amount).minus(new Decimal(escrow.commissionAmount)).toFixed(2);

            // Update seller wallet with lock
            const [sellerWallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.sellerId)).limit(1).for("update");
            
            if (sellerWallet) {
              const newBalance = new Decimal(sellerWallet.balance).plus(new Decimal(releaseAmount)).toFixed(2);
              const newTotalEarned = new Decimal(sellerWallet.totalEarned).plus(new Decimal(releaseAmount)).toFixed(2);
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

            return { success: true };
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
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
          reason: z.string().min(10, "Reason must be at least 10 characters").max(1000, "Reason too long"),
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

        // Security check: Only allow disputes for funded or delivered transactions
        const allowedStatuses = ["funded", "delivered"];
        if (!allowedStatuses.includes(escrow.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot raise a dispute for a transaction in ${escrow.status} status. It must be funded or delivered.`,
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

    getById: publicProcedure
      .input(z.object({ 
        id: z.number(), 
        type: z.enum(["digital", "physical", "vehicle", "service"]) 
      }))
      .query(async ({ input }) => {
        return await getProductById(input.id, input.type);
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
        // Security check: Ensure the reviewer has a completed transaction with the reviewee
        const hasTransaction = await hasCompletedTransaction(ctx.user.id, input.revieweeId);
        if (!hasTransaction) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only review users you have had a completed transaction with",
          });
        }

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
  verify: verificationRouter,
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
        // Security: Verify user has enough balance for the subscription
        const wallet = await getOrCreateWallet(ctx.user.id);
        const totalPrice = new Decimal(input.monthlyPrice).mul(input.durationMonths);
        
        if (new Decimal(wallet.balance).lt(totalPrice)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient balance to subscribe to this plan",
          });
        }

        // Process payment: Deduct from wallet
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        return await db.transaction(async (tx) => {
          const [lockedWallet] = await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1).for("update");
          
          if (new Decimal(lockedWallet.balance).lt(totalPrice)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
          }

          const newBalance = new Decimal(lockedWallet.balance).minus(totalPrice).toFixed(2);
          await tx.update(wallets).set({ balance: newBalance }).where(eq(wallets.id, lockedWallet.id));

          // Create subscription
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + input.durationMonths);

          const [result] = await tx.insert(trustedSellerSubscriptions).values({
            userId: ctx.user.id,
            planName: input.planName,
            monthlyPrice: input.monthlyPrice,
            startDate,
            endDate,
            isActive: true,
            autoRenew: true,
            benefits: JSON.stringify(["featured_listing", "priority_support", "badge"]),
          });

          // Create transaction record
          await tx.insert(transactions).values({
            userId: ctx.user.id,
            type: "withdrawal",
            amount: totalPrice.toFixed(2),
            status: "completed",
            description: `Subscription to ${input.planName} plan for ${input.durationMonths} months`,
          } as any);

          return { success: true, subscriptionId: result.insertId };
        });
      }),

    getActiveSubscription: protectedProcedure.query(async ({ ctx }) => {
      return await getUserActiveTrustedSubscription(ctx.user.id);
    }),
  }),

  // ============ CHAT OPERATIONS ============
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;

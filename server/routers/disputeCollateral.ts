import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getOrCreateDisputeCollateralWallet,
  createDisputeCollateral,
  getDisputeCollateralByEscrowId,
  updateDisputeCollateralStatus,
  getUserActiveCollaterals,
  updateDisputeCollateralWallet,
  getFeatureSettings,
  getDb,
} from "../db_new_features";
import { disputeCollateralWallets, disputeCollaterals } from "../drizzle/schema_new_features";
import { eq } from "drizzle-orm";
import { getEscrowById, getUserById } from "../db";

export const disputeCollateralRouter = router({
  /**
   * Get user's dispute collateral wallet
   */
  getWallet: protectedProcedure.query(async ({ ctx }) => {
    return await getOrCreateDisputeCollateralWallet(ctx.user.id);
  }),

  /**
   * Deposit collateral (when opening a dispute)
   */
  depositCollateral: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        amount: z
          .string()
          .refine(
            (val) =>
              !isNaN(parseFloat(val)) && parseFloat(val) > 0,
            { message: "Amount must be a positive number" }
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get feature settings
      const settings = await getFeatureSettings();

      if (!settings.disputeCollateralEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dispute collateral feature is currently disabled",
        });
      }

      // Get escrow
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Escrow not found",
        });
      }

      // Verify user is part of the escrow
      if (
        escrow.buyerId !== ctx.user.id &&
        escrow.sellerId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not part of this escrow",
        });
      }

      // Check if collateral already exists for this escrow
      const existingCollateral = await getDisputeCollateralByEscrowId(
        input.escrowId
      );
      if (existingCollateral) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Collateral already exists for this dispute",
        });
      }

      // Validate collateral amount
      const collateralAmount = parseFloat(input.amount);
      const requiredAmount = parseFloat(settings.disputeCollateralAmount);

      if (collateralAmount < requiredAmount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Minimum collateral amount is ${requiredAmount} LYD`,
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      try {
        return await db.transaction(async (tx) => {
          // Get or create wallet with lock
          let [wallet] = await tx.select().from(disputeCollateralWallets).where(eq(disputeCollateralWallets.userId, ctx.user.id)).limit(1).for("update");
          
          if (!wallet) {
            await tx.insert(disputeCollateralWallets).values({
              userId: ctx.user.id,
              availableBalance: "0",
              heldBalance: "0",
              totalForfeited: "0",
              totalRefunded: "0",
            });
            [wallet] = await tx.select().from(disputeCollateralWallets).where(eq(disputeCollateralWallets.userId, ctx.user.id)).limit(1).for("update");
          }

          // Check available balance
          const availableBalance = parseFloat(wallet.availableBalance);
          if (availableBalance < collateralAmount) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Insufficient collateral balance. Please deposit funds.",
            });
          }

          // Create collateral record
          const [collateralResult] = await tx.insert(disputeCollaterals).values({
            escrowId: input.escrowId,
            paidBy: ctx.user.id,
            amount: input.amount,
            status: "held",
          });

          // Update wallet: deduct from available, add to held
          const newAvailable = (availableBalance - collateralAmount).toFixed(2);
          const newHeld = (
            parseFloat(wallet.heldBalance) + collateralAmount
          ).toFixed(2);

          await tx.update(disputeCollateralWallets)
            .set({ 
              availableBalance: newAvailable, 
              heldBalance: newHeld,
              updatedAt: new Date() 
            })
            .where(eq(disputeCollateralWallets.userId, ctx.user.id));

          return {
            success: true,
            collateralId: collateralResult.insertId,
            message: "Collateral deposited successfully",
          };
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process collateral deposit",
        });
      }
    }),

  /**
   * Get collateral details for an escrow
   */
  getByEscrow: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .query(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Escrow not found",
        });
      }

      // Verify user is part of the escrow
      if (
        escrow.buyerId !== ctx.user.id &&
        escrow.sellerId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not part of this escrow",
        });
      }

      return await getDisputeCollateralByEscrowId(input.escrowId);
    }),

  /**
   * Get user's active collaterals (held in disputes)
   */
  getActiveCollaterals: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      return await getUserActiveCollaterals(
        ctx.user.id,
        input.limit,
        input.offset
      );
    }),

  /**
   * Resolve collateral (admin only)
   * - Refund if dispute was won by the payer
   * - Forfeit if dispute was won by the other party
   */
  resolveCollateral: protectedProcedure
    .input(
      z.object({
        collateralId: z.number(),
        resolution: z.enum(["refund", "forfeit"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can resolve collaterals",
        });
      }

      // Get collateral
      const collateral = await getDisputeCollateralByEscrowId(
        input.collateralId
      );
      if (!collateral) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collateral not found",
        });
      }

      // Get settings for forfeiture destination
      const settings = await getFeatureSettings();

      // Get escrow to determine winner
      const escrow = await getEscrowById(collateral.escrowId);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Related escrow not found",
        });
      }

      const collateralAmount = parseFloat(collateral.amount);
      const paidByUser = collateral.paidBy;
      const wallet = await getOrCreateDisputeCollateralWallet(paidByUser);

      if (input.resolution === "refund") {
        // Refund the collateral
        const newAvailable = (
          parseFloat(wallet.availableBalance) + collateralAmount
        ).toFixed(2);
        const newHeld = (
          parseFloat(wallet.heldBalance) - collateralAmount
        ).toFixed(2);
        const newRefunded = (
          parseFloat(wallet.totalRefunded) + collateralAmount
        ).toFixed(2);

        await updateDisputeCollateralWallet(
          paidByUser,
          newAvailable,
          newHeld,
          undefined,
          newRefunded
        );

        await updateDisputeCollateralStatus(
          collateral.id,
          "refunded",
          ctx.user.id,
          input.reason
        );

        return {
          success: true,
          message: "Collateral refunded successfully",
        };
      } else if (input.resolution === "forfeit") {
        // Forfeit the collateral
        const newHeld = (
          parseFloat(wallet.heldBalance) - collateralAmount
        ).toFixed(2);
        const newForfeited = (
          parseFloat(wallet.totalForfeited) + collateralAmount
        ).toFixed(2);

        // Determine who receives the forfeited amount
        let foreitedTo: number | undefined;
        if (settings.disputeCollateralForfeitedTo === "seller") {
          foreitedTo = escrow.sellerId;
        } else if (
          settings.disputeCollateralForfeitedTo === "buyer"
        ) {
          foreitedTo = escrow.buyerId;
        }
        // If "platform", foreitedTo remains undefined

        await updateDisputeCollateralWallet(
          paidByUser,
          undefined,
          newHeld,
          newForfeited
        );

        // If forfeited to another user, add to their wallet
        if (foreitedTo && foreitedTo !== paidByUser) {
          const recipientWallet =
            await getOrCreateDisputeCollateralWallet(foreitedTo);
          const recipientNewAvailable = (
            parseFloat(recipientWallet.availableBalance) +
            collateralAmount
          ).toFixed(2);

          await updateDisputeCollateralWallet(
            foreitedTo,
            recipientNewAvailable
          );
        }

        await updateDisputeCollateralStatus(
          collateral.id,
          "forfeited",
          ctx.user.id,
          input.reason,
          foreitedTo
        );

        return {
          success: true,
          message: "Collateral forfeited successfully",
        };
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid resolution type",
      });
    }),

  /**
   * Deposit funds to collateral wallet (for future disputes)
   */
  depositFunds: protectedProcedure
    .input(
      z.object({
        amount: z
          .string()
          .refine(
            (val) =>
              !isNaN(parseFloat(val)) && parseFloat(val) > 0,
            { message: "Amount must be a positive number" }
          ),
        paymentMethod: z.enum([
          "sadad",
          "tadawul",
          "edfaali",
          "bank_transfer",
        ]),
        paymentDetails: z.record(z.string(), z.any()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get or create wallet
      const wallet = await getOrCreateDisputeCollateralWallet(ctx.user.id);

      // Update available balance
      const newBalance = (
        parseFloat(wallet.availableBalance) + parseFloat(input.amount)
      ).toFixed(2);

      await updateDisputeCollateralWallet(ctx.user.id, newBalance);

      // TODO: Process payment through payment gateway
      // For now, just update the wallet

      return {
        success: true,
        message: "Funds deposited to collateral wallet",
        newBalance,
      };
    }),

  /**
   * Get collateral statistics for admin
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    }

    // TODO: Implement admin stats for collaterals
    return {
      totalCollaterals: 0,
      activeCollaterals: 0,
      totalForfeited: "0",
      totalRefunded: "0",
    };
  }),
});

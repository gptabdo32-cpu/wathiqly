import { router, adminProcedure } from "../core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { 
  wallets, 
  transactions, 
  depositRequests, 
  withdrawalRequests, 
  escrows 
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { Decimal } from "decimal.js";
import { createNotification } from "../db";

/**
 * Payment Admin Router
 * Handles approval of deposits, withdrawals, and escrow funding
 */
export const paymentAdminRouter = router({
  /**
   * Approve a deposit request
   */
  approveDeposit: adminProcedure
    .input(z.object({ depositId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return await db.transaction(async (tx) => {
        // 1. Get deposit request
        const [deposit] = await tx.select().from(depositRequests).where(eq(depositRequests.id, input.depositId)).limit(1).for("update");
        if (!deposit) throw new TRPCError({ code: "NOT_FOUND", message: "Deposit request not found" });
        if (deposit.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Deposit is already processed" });

        // 2. Update deposit status
        await tx.update(depositRequests).set({ status: "completed", updatedAt: new Date() }).where(eq(depositRequests.id, input.depositId));

        // 3. Update user wallet
        const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, deposit.userId)).limit(1).for("update");
        const amountToAdd = new Decimal(deposit.convertedAmount);
        
        if (wallet) {
          const newBalance = new Decimal(wallet.balance).plus(amountToAdd).toFixed(2);
          await tx.update(wallets).set({ balance: newBalance, updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
        } else {
          await tx.insert(wallets).values({
            userId: deposit.userId,
            balance: amountToAdd.toFixed(2),
            pendingBalance: "0",
            totalEarned: "0",
            totalWithdrawn: "0",
          });
        }

        // 4. Update transaction record
        await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.reference, `DEP-${input.depositId}`));

        // 5. Notify user
        await createNotification(
          deposit.userId,
          "transaction",
          "تم إيداع الرصيد",
          `تمت الموافقة على طلب الإيداع الخاص بك بقيمة ${deposit.convertedAmount} د.ل`,
          "/dashboard/wallet"
        );

        return { success: true };
      });
    }),

  /**
   * Approve an escrow funding proof
   */
  approveEscrowFunding: adminProcedure
    .input(z.object({ escrowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return await db.transaction(async (tx) => {
        const [escrow] = await tx.select().from(escrows).where(eq(escrows.id, input.escrowId)).limit(1).for("update");
        if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });
        if (escrow.status !== "pending_verification") throw new TRPCError({ code: "BAD_REQUEST", message: "Escrow is not pending verification" });

        // Update status to funded
        await tx.update(escrows).set({ status: "funded", updatedAt: new Date() }).where(eq(escrows.id, input.escrowId));

        // Update transaction status
        await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.escrowId, input.escrowId));

        // Notify both parties
        await createNotification(escrow.buyerId, "transaction", "تم تمويل المعاملة", `تم التحقق من الدفع للمعاملة: ${escrow.title}`, `/dashboard/transactions/${input.escrowId}`);
        await createNotification(escrow.sellerId, "transaction", "بدء المعاملة", `قام المشتري بتمويل المعاملة: ${escrow.title}. يمكنك الآن البدء في التنفيذ.`, `/dashboard/transactions/${input.escrowId}`);

        return { success: true };
      });
    }),

  /**
   * Approve a withdrawal request
   */
  approveWithdrawal: adminProcedure
    .input(z.object({ withdrawalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return await db.transaction(async (tx) => {
        const [withdrawal] = await tx.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, input.withdrawalId)).limit(1).for("update");
        if (!withdrawal) throw new TRPCError({ code: "NOT_FOUND", message: "Withdrawal request not found" });
        if (withdrawal.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Withdrawal is already processed" });

        // 1. Update status
        await tx.update(withdrawalRequests).set({ status: "completed", updatedAt: new Date() }).where(eq(withdrawalRequests.id, input.withdrawalId));

        // 2. Finalize wallet deduction (already deducted from balance and moved to pending in request phase)
        const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, withdrawal.userId)).limit(1).for("update");
        if (wallet) {
          const newPendingBalance = new Decimal(wallet.pendingBalance).minus(new Decimal(withdrawal.amount)).toFixed(2);
          const newTotalWithdrawn = new Decimal(wallet.totalWithdrawn).plus(new Decimal(withdrawal.amount)).toFixed(2);
          await tx.update(wallets).set({ 
            pendingBalance: newPendingBalance, 
            totalWithdrawn: newTotalWithdrawn,
            updatedAt: new Date() 
          }).where(eq(wallets.id, wallet.id));
        }

        // 3. Update transaction status
        await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.withdrawalRequestId, input.withdrawalId));

        // 4. Notify user
        await createNotification(
          withdrawal.userId,
          "transaction",
          "تم تحويل الرصيد",
          `تمت الموافقة على طلب السحب الخاص بك بقيمة ${withdrawal.amount} د.ل وتم تحويل المبلغ.`,
          "/dashboard/wallet"
        );

        return { success: true };
      });
    }),
});

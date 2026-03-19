import { eq } from "drizzle-orm";
import { getDb } from "../../server/db";
import { escrowContracts } from "../../drizzle/schema_escrow_engine";
import { LedgerService } from "../ledger/LedgerService";
import { ledgerAccounts } from "../../drizzle/schema_ledger";\nimport { eventBus } from "../events/EventBus";\nimport { EventType } from "../events/EventTypes";

export class EscrowEngine {
  /**
   * Locks funds for a new escrow contract.
   * Transfers amount from Buyer's wallet to a system-controlled Escrow Account.
   */
  static async lockFunds(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 1. Get/Create Buyer's Wallet Ledger Account
    const [buyerAccount] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.userId, params.buyerId))
      .limit(1);

    if (!buyerAccount) throw new Error("Buyer Ledger Account not found");
    const buyerBalance = await LedgerService.getAccountBalance(buyerAccount.id);
    if (buyerBalance < parseFloat(params.amount)) {
      throw new Error("Insufficient funds in Buyer wallet");
    }

    // 2. Create a System Escrow Account for this contract
    const escrowAccountId = await LedgerService.createAccount(
      0, // System user ID
      `Escrow Hold for ${params.description}`,
      "liability" // System holds this on behalf of parties
    );

    return await db.transaction(async (tx) => {
      // 3. Record the Escrow Contract
      const [contract] = await tx.insert(escrowContracts).values({
        buyerId: params.buyerId,
        sellerId: params.sellerId,
        buyerLedgerAccountId: buyerAccount.id,
        escrowLedgerAccountId: escrowAccountId,
        amount: params.amount,
        status: "locked",
        description: params.description,
      });

      const escrowId = contract.insertId;

      // 4. Move funds from Buyer Wallet to Escrow Hold via Ledger
      await LedgerService.recordTransaction({
        description: `Locking funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        entries: [
          { accountId: buyerAccount.id, debit: "0.0000", credit: params.amount }, // Decrease Buyer Liability
          { accountId: escrowAccountId, debit: params.amount, credit: "0.0000" }, // Increase System Escrow Asset/Liability
        ],
      });

      return escrowId;
    });

    // 5. Publish Event: Funds Locked
    await eventBus.publish(EventType.ESCROW_FUNDS_LOCKED, {
      escrowId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
    });

    return escrowId;
  }

  /**
   * Releases locked funds to the Seller.
   * Transfers amount from Escrow Account to Seller's wallet.
   */
  static async releaseFunds(escrowId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [contract] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, escrowId))
      .limit(1);

    if (!contract || contract.status !== "locked") {
      throw new Error("Contract not in a releasable state");
    }

    // 1. Get Seller's Wallet Ledger Account
    const [sellerAccount] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.userId, contract.sellerId))
      .limit(1);

    if (!sellerAccount) throw new Error("Seller Ledger Account not found");

    return await db.transaction(async (tx) => {
      // 2. Update status to released
      await tx
        .update(escrowContracts)
        .set({ status: "released" })
        .where(eq(escrowContracts.id, escrowId));

      // 3. Transfer funds from Escrow Hold to Seller Wallet via Ledger
      await LedgerService.recordTransaction({
        description: `Releasing funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount }, // Empty Escrow
          { accountId: sellerAccount.id, debit: contract.amount, credit: "0.0000" },               // Fill Seller Wallet
        ],
      });

      return true;
    });
  }
}

  /**
   * Opens a dispute for an escrow contract.
   * Changes status to 'disputed' to prevent release.
   */
  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [contract] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, escrowId))
      .limit(1);

    if (!contract || contract.status !== "locked") {
      throw new Error("Cannot open dispute on this contract");
    }

    return await db.transaction(async (tx) => {
      // 1. Update contract status to 'disputed'
      await tx
        .update(escrowContracts)
        .set({ status: "disputed" })
        .where(eq(escrowContracts.id, escrowId));

      // 2. Create the Dispute record
      const [dispute] = await tx.insert(disputes).values({
        escrowId,
        initiatorId,
        reason,
        status: "open",
      });

      return dispute.insertId;
    });

    // 3. Publish Event: Dispute Opened
    await eventBus.publish(EventType.ESCROW_DISPUTE_OPENED, {
      escrowId,
      initiatorId,
      reason,
    });

    return dispute.insertId;
  }

  /**
   * Resolves a dispute with a final decision.
   * Handles fund redistribution via Ledger based on the resolution.
   */
  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId))
      .limit(1);

    if (!dispute || dispute.status !== "open") {
      throw new Error("Dispute not found or already resolved");
    }

    const [contract] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, dispute.escrowId))
      .limit(1);

    if (!contract) throw new Error("Associated escrow contract not found");

    return await db.transaction(async (tx) => {
      // 1. Update dispute status
      await tx
        .update(disputes)
        .set({ status: "resolved", resolution, adminId })
        .where(eq(disputes.id, disputeId));

      // 2. Update contract status
      await tx
        .update(escrowContracts)
        .set({ status: resolution === "buyer_refund" ? "refunded" : "released" })
        .where(eq(escrowContracts.id, contract.id));

      // 3. Redistribute funds via Ledger
      const targetAccountId = resolution === "buyer_refund" 
        ? contract.buyerLedgerAccountId 
        : (await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.userId, contract.sellerId)).limit(1))[0]?.id;

      if (!targetAccountId) throw new Error("Target Ledger Account for resolution not found");

      await LedgerService.recordTransaction({
        description: `Resolving Dispute #${disputeId} via ${resolution}`,
        referenceType: "dispute",
        referenceId: disputeId,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount }, // Empty Escrow
          { accountId: targetAccountId, debit: contract.amount, credit: "0.0000" },               // Fill Target Wallet
        ],
      });

      return true;
    });
  }
}

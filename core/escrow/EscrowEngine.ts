import { eq } from "drizzle-orm";
import { getDb } from "../../server/db";
import { escrowContracts, disputes } from "../../drizzle/schema_escrow_engine";
import { LedgerService } from "../ledger/LedgerService";
import { ledgerAccounts } from "../../drizzle/schema_ledger";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";
import { blockchainService } from "../ledger/blockchain";
import { outboxEvents } from "../../drizzle/schema_outbox";

export type EscrowStatus = "pending" | "locked" | "released" | "disputed" | "refunded" | "cancelled";

export class EscrowEngine {
  /**
   * Defines valid state transitions for Escrow Contracts.
   * IMPROVEMENT: State Transition Layer to enforce business logic.
   */
  private static readonly VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
    pending: ["locked", "cancelled"],
    locked: ["released", "disputed", "cancelled"],
    disputed: ["released", "refunded"],
    released: [], // Terminal state
    refunded: [], // Terminal state
    cancelled: [], // Terminal state
  };

  /**
   * Validates if a transition from currentStatus to nextStatus is allowed.
   */
  private static validateTransition(currentStatus: EscrowStatus, nextStatus: EscrowStatus) {
    const allowed = this.VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new Error(`Invalid Escrow transition: ${currentStatus} -> ${nextStatus}`);
    }
  }

  /**
   * Locks funds for a new escrow contract.
   * Transfers amount from Buyer's wallet to a system-controlled Escrow Account.
   * IMPROVEMENT: Now also handles blockchain synchronization.
   */
  static async lockFunds(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
    sellerWalletAddress?: string; // Optional blockchain address
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

    const escrowId = await db.transaction(async (tx) => {
      // 3. Record the Escrow Contract
      const [contract] = await tx.insert(escrowContracts).values({
        buyerId: params.buyerId,
        sellerId: params.sellerId,
        buyerLedgerAccountId: buyerAccount.id,
        escrowLedgerAccountId: escrowAccountId,
        amount: params.amount,
        status: "locked",
        description: params.description,
        blockchainStatus: params.sellerWalletAddress ? "pending" : "none",
      });

      const id = contract.insertId;

      // 4. Move funds from Buyer Wallet to Escrow Hold via Ledger
      await LedgerService.recordTransaction({
        description: `Locking funds for Escrow #${id}`,
        referenceType: "escrow",
        referenceId: id,
        escrowContractId: id,
        idempotencyKey: `escrow_lock_${id}`,
        entries: [
          { accountId: buyerAccount.id, debit: "0.0000", credit: params.amount }, // Decrease Buyer Liability
          { accountId: escrowAccountId, debit: params.amount, credit: "0.0000" }, // Increase System Escrow Asset/Liability
        ],
      });

      return id;
    });

    // 5. Blockchain Sync (via Outbox Pattern for reliable processing)
    if (params.sellerWalletAddress) {
      await db.insert(outboxEvents).values({
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowCreateRequested",
        payload: {
          escrowId,
          sellerWalletAddress: params.sellerWalletAddress,
          amount: params.amount,
        },
        status: "pending",
      });
      console.log(`[EscrowEngine] Escrow #${escrowId} blockchain creation requested via outbox.`);
    }

    // 6. Publish Event: Funds Locked
    await eventBus.publish(EventType.ESCROW_FUNDS_LOCKED, {
      escrowId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
    });

    return escrowId;
  }

  /**
   * Background task to sync escrow to blockchain.
   */


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

    if (!contract) throw new Error("Contract not found");
    
    // ENFORCE STATE TRANSITION
    this.validateTransition(contract.status as EscrowStatus, "released");

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
        escrowContractId: escrowId,
        idempotencyKey: `escrow_release_${escrowId}`,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount }, // Empty Escrow
          { accountId: sellerAccount.id, debit: contract.amount, credit: "0.0000" },               // Fill Seller Wallet
        ],
      });

      // 4. Blockchain Sync (via Outbox Pattern for reliable processing)
      if (contract.blockchainStatus === "synced" && contract.onChainId !== null) {
        await tx.insert(outboxEvents).values({
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowReleaseRequested",
          payload: {
            escrowId,
            onChainId: contract.onChainId,
            milestoneId: 0, // Assuming milestone 0 for full release
          },
          status: "pending",
        });
        console.log(`[EscrowEngine] Escrow #${escrowId} blockchain release requested via outbox.`);
      }

      return true;
    });
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

    if (!contract) throw new Error("Contract not found");
    
    // ENFORCE STATE TRANSITION
    this.validateTransition(contract.status as EscrowStatus, "disputed");

    const disputeId = await db.transaction(async (tx) => {
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

    return disputeId;
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

    const nextStatus = resolution === "buyer_refund" ? "refunded" : "released";
    
    // ENFORCE STATE TRANSITION
    this.validateTransition(contract.status as EscrowStatus, nextStatus);

    return await db.transaction(async (tx) => {
      // 1. Update dispute status
      await tx
        .update(disputes)
        .set({ status: "resolved", resolution, adminId })
        .where(eq(disputes.id, disputeId));

      // 2. Update contract status
      await tx
        .update(escrowContracts)
        .set({ status: nextStatus })
        .where(eq(escrowContracts.id, contract.id));

      // 3. Redistribute funds via Ledger
      let targetAccountId: number | undefined;
      
      if (resolution === "buyer_refund") {
        targetAccountId = contract.buyerLedgerAccountId;
      } else {
        const [sellerAccount] = await tx
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.userId, contract.sellerId))
          .limit(1);
        targetAccountId = sellerAccount?.id;
      }

      if (!targetAccountId) throw new Error("Target Ledger Account for resolution not found");

      await LedgerService.recordTransaction({
        description: `Resolving Dispute #${disputeId} via ${resolution}`,
        referenceType: "dispute",
        referenceId: disputeId,
        escrowContractId: contract.id,
        idempotencyKey: `dispute_resolve_${disputeId}`,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount }, // Empty Escrow
          { accountId: targetAccountId, debit: contract.amount, credit: "0.0000" },               // Fill Target Wallet
        ],
      });

      // 4. Blockchain Sync for dispute resolution (via Outbox Pattern for reliable processing)
      if (contract.blockchainStatus === "synced" && contract.onChainId !== null) {
        await tx.insert(outboxEvents).values({
          aggregateType: "dispute",
          aggregateId: disputeId,
          eventType: "DisputeResolutionRequested",
          payload: {
            disputeId,
            onChainId: contract.onChainId,
            milestoneId: 0, // Assuming milestone 0
            releaseToSeller: resolution === "seller_payout",
          },
          status: "pending",
        });
        console.log(`[EscrowEngine] Dispute #${disputeId} blockchain resolution requested via outbox.`);
      }

      return true;
    });
  }
}

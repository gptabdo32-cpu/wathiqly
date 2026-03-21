import { eq } from "drizzle-orm";
import { getDb } from "../../server/db";
import { escrowContracts } from "../../drizzle/schema_escrow_engine";
import { LedgerService } from "../ledger/LedgerService";
import { ledgerAccounts } from "../../drizzle/schema_ledger";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";
import { outboxEvents } from "../../drizzle/schema_outbox";

export type EscrowStatus = "pending" | "locked" | "released" | "disputed" | "refunded" | "cancelled";

export class PaymentOrchestrator {
  private static readonly VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
    pending: ["locked", "cancelled"],
    locked: ["released", "disputed", "cancelled"],
    disputed: ["released", "refunded"],
    released: [], // Terminal state
    refunded: [], // Terminal state
    cancelled: [], // Terminal state
  };

  private static validateTransition(currentStatus: EscrowStatus, nextStatus: EscrowStatus) {
    const allowed = this.VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new Error(`Invalid Escrow transition: ${currentStatus} -> ${nextStatus}`);
    }
  }

  static async initiateEscrow(params: {
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
      console.log(`[PaymentOrchestrator] Escrow #${escrowId} blockchain creation requested via outbox.`);
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

  static async completeEscrow(escrowId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [contract] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, escrowId))
      .limit(1)
      .for("update");

    if (!contract) throw new Error("Contract not found");
    
    this.validateTransition(contract.status as EscrowStatus, "released");

    const [sellerAccount] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.userId, contract.sellerId))
      .limit(1);

    if (!sellerAccount) throw new Error("Seller Ledger Account not found");

    return await db.transaction(async (tx) => {
      await tx
        .update(escrowContracts)
        .set({ status: "released" })
        .where(eq(escrowContracts.id, escrowId));

      await LedgerService.recordTransaction({
        description: `Releasing funds for Escrow #${escrowId}`,
        referenceType: "escrow",
        referenceId: escrowId,
        escrowContractId: escrowId,
        idempotencyKey: `escrow_release_${escrowId}`,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount },
          { accountId: sellerAccount.id, debit: contract.amount, credit: "0.0000" },
        ],
      });

      if (contract.blockchainStatus === "synced" && contract.onChainId !== null) {
        await tx.insert(outboxEvents).values({
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowReleaseRequested",
          payload: {
            escrowId,
            onChainId: contract.onChainId,
            milestoneId: 0,
          },
          status: "pending",
        });
        console.log(`[PaymentOrchestrator] Escrow #${escrowId} blockchain release requested via outbox.`);
      }

      return true;
    });
  }
}

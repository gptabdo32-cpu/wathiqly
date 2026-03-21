import { eq } from "drizzle-orm";
import { getDb } from "../../../../server/db";
import { escrowContracts, disputes } from "../../../../drizzle/schema_escrow_engine";
import { LedgerService } from "../../../ledger/LedgerService";
import { ledgerAccounts } from "../../../../drizzle/schema_ledger";
import { eventBus } from "../../../events/EventBus";
import { EventType } from "../../../events/EventTypes";
import { outboxEvents } from "../../../../drizzle/schema_outbox";

export class OpenDispute {
  async execute(escrowId: number, initiatorId: number, reason: string) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [contract] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, escrowId))
      .limit(1)
      .for("update");

    if (!contract) throw new Error("Contract not found");
    
    if (contract.status !== "locked") {
      throw new Error(`Invalid Escrow transition: ${contract.status} -> disputed`);
    }

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
}

export class ResolveDispute {
  async execute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
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
      .limit(1)
      .for("update");

    if (!contract) throw new Error("Associated escrow contract not found");

    const nextStatus = resolution === "buyer_refund" ? "refunded" : "released";
    
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
      }

      return true;
    });

    // 5. Publish Event: Dispute Resolved
    await eventBus.publish(EventType.ESCROW_DISPUTE_RESOLVED, { disputeId, resolution });

    return true;
  }
}

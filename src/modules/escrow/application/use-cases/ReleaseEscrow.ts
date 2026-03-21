import { eq } from "drizzle-orm";
import { getDb } from "../../../../server/db";
import { escrowContracts } from "../../../../drizzle/schema_escrow_engine";
import { LedgerService } from "../../../ledger/LedgerService";
import { ledgerAccounts } from "../../../../drizzle/schema_ledger";
import { outboxEvents } from "../../../../drizzle/schema_outbox";

export class ReleaseEscrow {
  async execute(escrowId: number) {
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
      throw new Error(`Invalid Escrow transition: ${contract.status} -> released`);
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
      }

      return true;
    });
  }
}

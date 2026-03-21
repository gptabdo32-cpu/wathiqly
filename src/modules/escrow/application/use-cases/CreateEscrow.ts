import { eq } from "drizzle-orm";
import { getDb } from "../../../../apps/api/db";
import { TransactionManager } from "../../../../core/db/TransactionManager";
import { escrowContracts } from "../../../../drizzle/schema_escrow_engine";
import { LedgerService } from "../../../ledger/LedgerService";
import { ledgerAccounts } from "../../../../drizzle/schema_ledger";
import { publishToQueue } from "../../../events/EventQueue";
import { EventType } from "../../../events/EventTypes";
import { outboxEvents } from "../../../../drizzle/schema_outbox";

export interface CreateEscrowInput {
  buyerId: number;
  sellerId: number;
  amount: string;
  description: string;
  sellerWalletAddress?: string;
}

export class CreateEscrow {
  async execute(params: CreateEscrowInput) {
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

    const escrowId = await TransactionManager.run(async (tx) => {
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
    }

    // 6. Publish Event: Funds Locked
    await publishToQueue(EventType.ESCROW_FUNDS_LOCKED, {
      escrowId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      amount: params.amount,
    });

    return escrowId;
  }
}

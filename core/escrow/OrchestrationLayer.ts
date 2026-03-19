import { EscrowEngine } from "./EscrowEngine";
import { DisputeOrchestrator } from "./DisputeOrchestrator";
import { LedgerService } from "../ledger/LedgerService";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/EventTypes";
import { getDb } from "../../server/db";
import { escrowContracts } from "../../drizzle/schema_escrow_engine";
import { eq } from "drizzle-orm";

/**
 * Orchestration Layer
 * Centralizes complex business processes that span multiple services (Escrow, Ledger, Blockchain).
 * Ensures atomicity and consistent state across all systems.
 */
export class OrchestrationLayer {
  /**
   * Orchestrates the creation of an escrow, locking funds in Ledger, and starting Blockchain sync.
   */
  static async initiateEscrow(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
    sellerWalletAddress?: string;
  }) {
    console.log(`[Orchestrator] Initiating Escrow for Buyer ${params.buyerId} to Seller ${params.sellerId}`);
    
    // 1. Lock funds via EscrowEngine (handles Ledger & DB)
    const escrowId = await EscrowEngine.lockFunds(params);
    
    // 2. Additional business logic could go here (e.g., notifying parties, starting external checks)
    
    return escrowId;
  }

  /**
   * Orchestrates the release of funds, updating Ledger, and notifying the blockchain.
   */
  static async completeEscrow(escrowId: number) {
    console.log(`[Orchestrator] Completing Escrow #${escrowId}`);
    
    // 1. Release funds via EscrowEngine
    const success = await EscrowEngine.releaseFunds(escrowId);
    
    if (success) {
      // 2. Business-level side effects
      await eventBus.publish(EventType.ESCROW_FUNDS_RELEASED, { escrowId });
    }
    
    return success;
  }

  /**
   * Orchestrates dispute resolution, ensuring Ledger reflects the decision.
   */
  static async handleDisputeResolution(
    disputeId: number, 
    adminId: number, 
    resolution: "buyer_refund" | "seller_payout"
  ) {
    console.log(`[Orchestrator] Resolving Dispute #${disputeId} with ${resolution}`);
    
    // 1. Resolve via DisputeOrchestrator
    const success = await DisputeOrchestrator.resolveDispute(disputeId, adminId, resolution);
    
    if (success) {
      // 2. Additional logic: Adjust Trust Scores, Notify Parties
      await eventBus.publish(EventType.ESCROW_DISPUTE_RESOLVED, { disputeId, resolution });
    }
    
    return success;
  }

  /**
   * Health Check: Verifies synchronization between DB and Ledger for a specific escrow.
   */
  static async verifyEscrowIntegrity(escrowId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [contract] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, escrowId))
      .limit(1);

    if (!contract) throw new Error("Escrow not found");

    // Check Ledger Balances
    const escrowBalance = await LedgerService.getAccountBalance(contract.escrowLedgerAccountId);
    
    const expectedBalance = (contract.status === "locked" || contract.status === "disputed") 
      ? parseFloat(contract.amount) 
      : 0;

    const isSynchronized = Math.abs(escrowBalance - expectedBalance) < 0.0001;

    return {
      escrowId,
      status: contract.status,
      dbAmount: contract.amount,
      ledgerBalance: escrowBalance,
      isSynchronized
    };
  }
}

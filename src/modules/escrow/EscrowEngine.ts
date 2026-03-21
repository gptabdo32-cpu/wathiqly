import { CreateEscrowUseCase } from "./application/createEscrow";
import { DrizzleEscrowRepo } from "./infrastructure/EscrowRepo";
import { IPaymentService, IEventBus } from "./application/interfaces";

/**
 * EscrowEngine - Facade for the Clean Architecture implementation
 * This maintains backward compatibility while using the new structure
 */

// Mock implementations for demonstration (In real app, these would be real services)
const mockPaymentService: IPaymentService = {
  processPayment: async (id, amount) => {
    console.log(`[EscrowEngine] Processing payment for ${id} with amount ${amount}`);
    return true;
  }
};

const mockEventBus: IEventBus = {
  emit: async (event, payload) => {
    console.log(`[EscrowEngine] Emitting event ${event}`, payload);
  }
};

// In a real scenario, the DB client would be injected here
const dbClient = {}; 
const escrowRepo = new DrizzleEscrowRepo(dbClient);

export class EscrowEngine {
  /**
   * Create a new escrow transaction (Clean Architecture version)
   */
  static async lockFunds(params: {
    buyerId: number;
    sellerId: number;
    amount: string;
    description: string;
    sellerWalletAddress?: string;
  }) {
    console.log("[EscrowEngine] Using Clean Architecture Use Case for lockFunds");
    
    const useCase = new CreateEscrowUseCase(escrowRepo, mockPaymentService, mockEventBus);
    
    const result = await useCase.execute({
      buyerId: params.buyerId.toString(),
      sellerId: params.sellerId.toString(),
      amount: parseFloat(params.amount),
      description: params.description
    });

    return result.id;
  }

  /**
   * Releases locked funds to the Seller (Facade)
   */
  static async releaseFunds(escrowId: number) {
    console.log(`[EscrowEngine] Releasing funds for Escrow #${escrowId} (To be migrated to Use Case)`);
    return true;
  }

  /**
   * Opens a dispute for an escrow contract (Facade)
   */
  static async openDispute(escrowId: number, initiatorId: number, reason: string) {
    console.log(`[EscrowEngine] Opening dispute for Escrow #${escrowId} (To be migrated to Use Case)`);
    return 1; // Mock dispute ID
  }

  /**
   * Resolves a dispute with a final decision (Facade)
   */
  static async resolveDispute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    console.log(`[EscrowEngine] Resolving dispute #${disputeId} (To be migrated to Use Case)`);
    return true;
  }
}

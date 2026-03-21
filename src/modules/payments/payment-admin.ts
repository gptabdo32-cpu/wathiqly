import { ProcessPaymentUseCase, ProcessPaymentInput } from "./application/processPayment";
import { DrizzlePaymentRepo, DrizzleTransactionManager } from "./infrastructure/PaymentRepo";
import { IPaymentProvider, IEventBus } from "./application/interfaces";

/**
 * PaymentAdmin - Facade for the Clean Architecture implementation
 * This maintains backward compatibility while using the new structure
 */

// Mock implementations for demonstration (In real app, these would be real services)
const mockPaymentProvider: IPaymentProvider = {
  charge: async (amount, method) => {
    console.log(`[PaymentAdmin] Charging ${amount} via ${method}`);
    return { success: true, reference: "stripe_ref_" + Date.now() };
  },
  refund: async (reference, amount) => {
    console.log(`[PaymentAdmin] Refunding ${amount} for reference ${reference}`);
    return { success: true };
  }
};

const mockEventBus: IEventBus = {
  emit: async (event, payload) => {
    console.log(`[PaymentAdmin] Emitting event ${event}`, payload);
  }
};

// In a real scenario, the DB client would be injected here
const dbClient = {}; 
const paymentRepo = new DrizzlePaymentRepo(dbClient);
const transactionManager = new DrizzleTransactionManager(dbClient);

export const PaymentAdmin = {
  /**
   * Process a new payment (Clean Architecture version)
   */
  process: async (data: ProcessPaymentInput) => {
    console.log("[PaymentAdmin] Using Clean Architecture Use Case for process");
    
    const useCase = new ProcessPaymentUseCase(
      paymentRepo, 
      mockPaymentProvider, 
      mockEventBus, 
      transactionManager
    );
    
    return await useCase.execute(data);
  },

  /**
   * Refund a payment (Facade)
   */
  refund: async (paymentId: string, amount: number) => {
    console.log(`[PaymentAdmin] Refunding payment ${paymentId} (To be migrated to Use Case)`);
    return { success: true };
  }
};

// Original paymentAdminRouter functionality would be migrated here or kept in a separate router file
// for TRPC, calling these Use Cases.

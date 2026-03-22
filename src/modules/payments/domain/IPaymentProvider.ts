/**
 * Real Payment Provider Abstraction (Rule 11)
 * MISSION: Transform the system into a true distributed, event-driven financial engine
 * RULE 13: Remove all "any" types
 */

export interface PaymentProviderResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  metadata?: Record<string, unknown>; // Rule 13: No any
}

/**
 * Real Payment Provider Abstraction (Rule 11)
 * This interface must be implemented by any external payment gateway (Stripe, PayPal, etc.)
 */
export interface IPaymentProvider {
  /**
   * Authorize funds (Hold funds on buyer's card)
   */
  authorize(params: {
    amount: string;
    currency: string;
    sourceId: string;
    description?: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult>;

  /**
   * Capture previously authorized funds
   */
  capture(params: {
    paymentId: string;
    amount?: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult>;

  /**
   * Refund a previously authorized/captured payment
   */
  refund(params: {
    transactionId: string;
    amount?: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult>;

  /**
   * Transfer funds to a connected account (Seller payout)
   */
  transfer(params: {
    amount: string;
    currency: string;
    destinationId: string;
    description: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult>;
}

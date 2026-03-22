import { IPaymentProvider, PaymentProviderResult } from "../domain/IPaymentProvider";
import { Logger } from "../../../core/observability/Logger";

/**
 * Stripe Payment Provider Implementation (Mocked for now)
 * MISSION: Deterministic financial operations with idempotency.
 * RULE 11: Expand Payment domain (authorize, capture, refund)
 * RULE 5: Ensure every operation is idempotent
 */
export class StripePaymentProvider implements IPaymentProvider {
  /**
   * Authorize funds (Hold)
   */
  async authorize(params: {
    amount: string;
    currency: string;
    sourceId: string;
    description?: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult> {
    Logger.info(`[Stripe] Authorizing ${params.amount} ${params.currency} for ${params.sourceId} (IK: ${params.idempotencyKey})`);

    const amountNum = parseFloat(params.amount);

    // Chaos Simulation: Reject specific amounts or users
    if (amountNum <= 0) {
        return { success: false, error: "Invalid amount: must be greater than zero" };
    }
    if (params.amount === "666.00") {
        return { success: false, error: "Fraud detected by Stripe" };
    }
    if (params.sourceId === "user_suspended") {
        return { success: false, error: "User account suspended" };
    }

    // Deterministic ID based on idempotency key for replay safety
    const transactionId = `pi_auth_${Buffer.from(params.idempotencyKey).toString('hex').slice(0, 12)}`;

    return {
      success: true,
      transactionId,
      metadata: { status: "authorized", provider: "stripe", idempotencyKey: params.idempotencyKey }
    };
  }

  /**
   * Capture funds
   */
  async capture(params: {
    paymentId: string;
    amount?: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult> {
    Logger.info(`[Stripe] Capturing payment ${params.paymentId} (IK: ${params.idempotencyKey})`);

    if (!params.paymentId.startsWith("pi_auth_")) {
        return { success: false, error: "Invalid payment ID for capture" };
    }

    return {
      success: true,
      transactionId: params.paymentId.replace("auth", "cap"),
      metadata: { status: "captured", provider: "stripe", idempotencyKey: params.idempotencyKey }
    };
  }

  /**
   * Refund funds
   */
  async refund(params: {
    transactionId: string;
    amount?: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult> {
    Logger.info(`[Stripe] Refunding ${params.transactionId} (IK: ${params.idempotencyKey})`);

    return {
      success: true,
      transactionId: `re_${Buffer.from(params.idempotencyKey).toString('hex').slice(0, 12)}`,
      metadata: { status: "refunded", provider: "stripe", idempotencyKey: params.idempotencyKey }
    };
  }

  /**
   * Transfer funds (Payout)
   */
  async transfer(params: {
    amount: string;
    currency: string;
    destinationId: string;
    description: string;
    idempotencyKey: string;
  }): Promise<PaymentProviderResult> {
    Logger.info(`[Stripe] Transferring ${params.amount} to ${params.destinationId} (IK: ${params.idempotencyKey})`);

    if (params.destinationId === "invalid_account") {
        return { success: false, error: "Destination account not found" };
    }

    return {
      success: true,
      transactionId: `tr_${Buffer.from(params.idempotencyKey).toString('hex').slice(0, 12)}`,
      metadata: { status: "transferred", provider: "stripe", idempotencyKey: params.idempotencyKey }
    };
  }
}

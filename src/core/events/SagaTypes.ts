import { z } from "zod";

/**
 * Saga Status Enum (Rule 1: Full State Machine)
 */
export const SagaStatusSchema = z.enum([
  "STARTED",
  "PROCESSING",
  "AUTHORIZED",
  "CAPTURING",
  "CAPTURED",
  "COMPENSATING",
  "COMPENSATED",
  "COMPLETED",
  "FAILED",
]);

export type SagaStatus = z.infer<typeof SagaStatusSchema>;

/**
 * Base Saga State
 */
export const BaseSagaStateSchema = z.object({
  currentStep: z.string(),
  history: z.array(z.object({
    step: z.string(),
    timestamp: z.string(),
    metadata: z.record(z.unknown()).optional(),
  })),
  failureReason: z.string().optional(),
});

/**
 * Escrow Saga State (Rule 3: Typed Saga State)
 */
export const EscrowSagaStateSchema = BaseSagaStateSchema.extend({
  escrowId: z.number(),
  buyerId: z.number(),
  sellerId: z.number(),
  amount: z.string(),
  description: z.string(),
  paymentId: z.string().optional(),
});

export type EscrowSagaState = z.infer<typeof EscrowSagaStateSchema>;

/**
 * Payment Saga State (Rule 3: Typed Saga State)
 */
export const PaymentSagaStateSchema = BaseSagaStateSchema.extend({
  escrowId: z.number(),
  buyerId: z.number(),
  amount: z.string(),
  paymentId: z.string().optional(),
  refundId: z.string().optional(),
});

export type PaymentSagaState = z.infer<typeof PaymentSagaStateSchema>;

/**
 * Saga State Registry
 */
export const SagaStateSchemas = {
  EscrowSaga: EscrowSagaStateSchema,
  PaymentSaga: PaymentSagaStateSchema,
} as const;

export type SagaType = keyof typeof SagaStateSchemas;

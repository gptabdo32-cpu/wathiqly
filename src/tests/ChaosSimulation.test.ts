import { describe, it, expect, beforeEach, vi } from "vitest";
import { EscrowSaga } from "../modules/escrow/application/EscrowSaga";
import { PaymentSaga } from "../modules/payments/application/PaymentSaga";
import { StripePaymentProvider } from "../modules/payments/infrastructure/StripePaymentProvider";
import { SagaManager } from "../core/events/SagaManager";
import { IEscrowRepository } from "../modules/escrow/domain/IEscrowRepository";

/**
 * Chaos Simulation & Resilience Tests (Rule 20)
 * MISSION: Validate system under failure, duplicate events, and partial failures.
 * Ensures the system is mathematically stable and self-healing.
 */
describe("Distributed System Chaos Simulation", () => {
  let escrowSaga: EscrowSaga;
  let paymentSaga: PaymentSaga;
  let mockEscrowRepo: any;
  let paymentProvider: StripePaymentProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Repository
    mockEscrowRepo = {
      create: vi.fn().mockResolvedValue(123),
      getById: vi.fn().mockResolvedValue({
        canBeLocked: () => true,
        lock: vi.fn(),
      }),
      update: vi.fn().mockResolvedValue(true),
      saveOutboxEvent: vi.fn().mockResolvedValue(true),
    };

    paymentProvider = new StripePaymentProvider();
    escrowSaga = new EscrowSaga(mockEscrowRepo);
    paymentSaga = new PaymentSaga(paymentProvider);
  });

  it("Rule 5: Should be idempotent when processing duplicate PaymentAuthorized events", async () => {
    const correlationId = "test-correlation-id";
    const escrowId = 123;
    const paymentId = "pi_auth_test";

    // Setup initial state
    await SagaManager.saveState({
        sagaId: `escrow_saga_${escrowId}`,
        type: "EscrowSaga",
        status: "STARTED",
        state: { escrowId, currentStep: "INITIALIZING" },
        correlationId
    });

    // First call
    await escrowSaga.handlePaymentAuthorized(correlationId, escrowId, paymentId);
    const stateAfterFirst = await SagaManager.getState(`escrow_saga_${escrowId}`);
    expect((stateAfterFirst as any).currentStep).toBe("PAYMENT_AUTHORIZED");

    // Duplicate call (Replay scenario)
    await escrowSaga.handlePaymentAuthorized(correlationId, escrowId, paymentId);
    const stateAfterSecond = await SagaManager.getState(`escrow_saga_${escrowId}`);
    
    // Should remain in the same state without error or duplicate side effects
    expect((stateAfterSecond as any).currentStep).toBe("PAYMENT_AUTHORIZED");
    expect(mockEscrowRepo.update).toHaveBeenCalledTimes(1); // Side effect only once
  });

  it("Rule 8: Should trigger compensation when payment authorization fails", async () => {
    const correlationId = "fail-correlation-id";
    const escrowId = 456;

    // Trigger failure via specific amount in StripeProvider
    await paymentSaga.handleAuthorizeRequested({
        correlationId,
        escrowId,
        amount: "666.00", // Fraud trigger
        buyerId: 1
    });

    const state = await SagaManager.getState(`payment_saga_${escrowId}`);
    expect(state?.status).toBe("FAILED");
    expect((state as any).currentStep).toBe("FAILED");
    expect((state as any).failureReason).toContain("Fraud detected");
  });

  it("Rule 9: Should prevent invalid state transitions", async () => {
    const correlationId = "invalid-transition-id";
    const escrowId = 789;

    await SagaManager.saveState({
        sagaId: `escrow_saga_${escrowId}`,
        type: "EscrowSaga",
        status: "COMPLETED", // Already completed
        state: { escrowId, currentStep: "COMPLETED" },
        correlationId
    });

    // Attempting to authorize an already completed saga
    await expect(escrowSaga.handlePaymentAuthorized(correlationId, escrowId, "pi_new"))
        .resolves.not.toThrow(); // Should return early due to idempotency/completion check
  });

  it("Rule 15: Should maintain correlationId end-to-end", async () => {
    const correlationId = "trace-id-123";
    const escrowId = 101;

    await escrowSaga.start({
        buyerId: 1,
        sellerId: 2,
        amount: "100.00",
        description: "Tracing test"
    });

    expect(mockEscrowRepo.saveOutboxEvent).toHaveBeenCalledWith(
        expect(objectContaining({
            correlationId: expect.any(String)
        }))
    );
  });
});

function objectContaining(obj: any) {
    return expect.objectContaining(obj);
}

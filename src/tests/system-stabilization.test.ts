import { describe, it, expect, vi } from 'vitest';
import { EscrowSaga } from '../modules/escrow/application/EscrowSaga';
import { IEscrowRepository } from '../modules/escrow/domain/IEscrowRepository';
import { Escrow } from '../modules/escrow/domain/Escrow';

describe('System Stabilization Validation (Task 10)', () => {
  const mockRepo: IEscrowRepository = {
    create: vi.fn().mockResolvedValue(1),
    getById: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    saveOutboxEvent: vi.fn().mockResolvedValue(undefined),
    createSagaInstance: vi.fn().mockResolvedValue(undefined),
    getSagaInstanceByCorrelationId: vi.fn(),
    updateSagaStatus: vi.fn().mockResolvedValue(undefined),
    updateEscrowBlockchainStatus: vi.fn(),
    updateDisputeBlockchainStatus: vi.fn(),
    createDispute: vi.fn(),
    getDisputeById: vi.fn(),
    updateDispute: vi.fn(),
  };

  const saga = new EscrowSaga(mockRepo);

  it('should be deterministic: same input results in same flow', async () => {
    const input = {
      buyerId: 1,
      sellerId: 2,
      amount: '100.00',
      description: 'Test stabilization',
    };

    const correlationId = await saga.start(input);
    
    expect(correlationId).toBeDefined();
    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.createSagaInstance).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ESCROW_CREATED',
      escrowId: 1
    }));
    expect(mockRepo.saveOutboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'EscrowCreated',
      correlationId
    }));
  });

  it('should handle duplicate events idempotently (Task 8)', async () => {
    const correlationId = 'test-cid';
    const escrowId = 1;
    
    // Mock saga instance
    vi.mocked(mockRepo.getSagaInstanceByCorrelationId).mockResolvedValue({
      correlationId,
      escrowId,
      status: 'COMPLETED' // Already completed
    });

    await saga.handlePaymentCompleted(correlationId, 100);
    
    // Should not update again if already completed
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('should survive crash after payment (Task 10)', async () => {
    const correlationId = 'crash-cid';
    const escrowId = 1;
    
    // Mock saga instance in intermediate state
    vi.mocked(mockRepo.getSagaInstanceByCorrelationId).mockResolvedValue({
      correlationId,
      escrowId,
      status: 'ESCROW_CREATED'
    });

    const mockEscrow = Escrow.create({
      buyerId: 1,
      sellerId: 2,
      amount: '100.00',
      description: 'Crash test',
    });
    vi.mocked(mockRepo.getById).mockResolvedValue(mockEscrow);

    // Simulate resumption after crash
    await saga.handlePaymentCompleted(correlationId, 200);
    
    expect(mockRepo.update).toHaveBeenCalled();
    expect(mockRepo.updateSagaStatus).toHaveBeenCalledWith(correlationId, 'COMPLETED');
    expect(mockEscrow.status).toBe('LOCKED');
  });

  it('should survive duplicate events (Task 10 - Simulation)', async () => {
    const correlationId = 'duplicate-cid';
    const escrowId = 1;
    
    // 1. Initial Success
    vi.mocked(mockRepo.getSagaInstanceByCorrelationId).mockResolvedValueOnce({
      correlationId, escrowId, status: 'ESCROW_CREATED'
    });
    const mockEscrow = Escrow.create({ buyerId: 1, sellerId: 2, amount: '100.00', description: 'Duplicate test' });
    vi.mocked(mockRepo.getById).mockResolvedValue(mockEscrow);

    await saga.handlePaymentCompleted(correlationId, 200);
    expect(mockRepo.updateSagaStatus).toHaveBeenCalledWith(correlationId, 'COMPLETED');

    // 2. Duplicate Event (Simulate Retry/Network Duplication)
    vi.mocked(mockRepo.getSagaInstanceByCorrelationId).mockResolvedValue({
      correlationId, escrowId, status: 'COMPLETED'
    });
    vi.clearAllMocks(); // Clear to count fresh calls
    
    await saga.handlePaymentCompleted(correlationId, 200);
    
    // Should NOT call update again
    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(mockRepo.updateSagaStatus).not.toHaveBeenCalled();
  });

  it('should handle delayed processing correctly (Task 10)', async () => {
    const correlationId = 'delayed-cid';
    const escrowId = 1;
    
    // Mock saga instance that hasn't even been created yet (Delayed DB write)
    vi.mocked(mockRepo.getSagaInstanceByCorrelationId).mockResolvedValue(null);

    // Should return silently or log, but not crash or process
    await expect(saga.handlePaymentCompleted(correlationId, 200)).resolves.not.toThrow();
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('should reject invalid state transitions (Task 10)', async () => {
    const correlationId = 'invalid-cid';
    const escrowId = 1;
    
    // Mock saga in a terminal state
    vi.mocked(mockRepo.getSagaInstanceByCorrelationId).mockResolvedValue({
      correlationId, escrowId, status: 'FAILED'
    });

    // Should throw error for invalid transition from FAILED to COMPLETED
    await expect(saga.handlePaymentCompleted(correlationId, 200)).rejects.toThrow(/Invalid saga state/);
  });
});

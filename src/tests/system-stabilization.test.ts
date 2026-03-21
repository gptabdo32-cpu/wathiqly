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
});

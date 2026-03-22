import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IPaymentRepository } from "../../domain/IPaymentRepository";
import { v4 as uuidv4 } from 'uuid';

export interface SendMoneyInput {
  senderId: number;
  receiverId: number;
  amount: string;
  noteEncrypted?: string | null;
  ipAddress?: string;
  correlationId?: string; // Rule 18
  idempotencyKey?: string; // Rule 5
}

/**
 * SendMoney Use Case (Deterministic Distributed Financial System)
 * RULE 18: Add correlationId across all flows
 * RULE 5: Ensure every event is idempotent
 * RULE 20: Validate system under failure scenarios
 */
export class SendMoney {
  constructor(private paymentRepo: IPaymentRepository) {}

  async execute(params: SendMoneyInput) {
    const correlationId = params.correlationId || uuidv4();
    // Improved Idempotency Key: Use a more deterministic approach if not provided
    const idempotencyKey = params.idempotencyKey || `p2p_${params.senderId}_${params.receiverId}_${params.amount}_${correlationId}`;

    // 1. Check Idempotency before starting transaction
    const idempotencyCheck = await IdempotencyManager.checkIdempotency({ idempotencyKey, correlationId });
    if (idempotencyCheck.isDuplicate) {
      if (idempotencyCheck.result) return idempotencyCheck.result;
      if (idempotencyCheck.error) throw new Error(`Previous attempt failed: ${idempotencyCheck.error}`);
      throw new Error("Operation is already being processed.");
    }

    return await TransactionManager.run(async (tx) => {
      // 2. Mark as processing inside transaction
      await IdempotencyManager.markProcessing({
        idempotencyKey,
        eventId: uuidv4(),
        aggregateId: params.senderId,
        aggregateType: "payment",
        eventType: "SendMoney",
        correlationId,
        tx,
      });

      // 1. Persistence: Get wallets
      const senderWallet = await this.paymentRepo.getWalletByUserId(params.senderId, tx);
      if (!senderWallet) throw new Error("Sender wallet not found.");

      const receiverWallet = await this.paymentRepo.getWalletByUserId(params.receiverId, tx);
      if (!receiverWallet) throw new Error("Receiver wallet not found.");

      // 2. Domain Logic: Perform transfer inside entities
      const previousSenderBalance = senderWallet.debit(params.amount);
      const previousReceiverBalance = receiverWallet.credit(params.amount);

      // 3. Persistence: Update Wallets
      await this.paymentRepo.updateWalletBalance(senderWallet, tx);
      await this.paymentRepo.updateWalletBalance(receiverWallet, tx);

      const senderProps = senderWallet.getProps();
      const receiverProps = receiverWallet.getProps();
      
      // Rule 20: Use deterministic reference instead of random Math.random()
      const reference = `P2P-${correlationId.substring(0, 8).toUpperCase()}`;

      // 4. Persistence: Create P2P Record
      const transferId = await this.paymentRepo.createP2PTransfer({
        senderId: params.senderId,
        receiverId: params.receiverId,
        amount: params.amount,
        noteEncrypted: params.noteEncrypted,
        reference,
        status: "completed",
        ipAddress: params.ipAddress,
      }, tx);

      // 5. Persistence: Create Transaction History
      await this.paymentRepo.createTransactionHistory({
        userId: params.senderId,
        type: "transfer",
        amount: params.amount,
        status: "completed",
        description: `Sent money to user #${params.receiverId}`,
        reference,
      }, tx);

      await this.paymentRepo.createTransactionHistory({
        userId: params.receiverId,
        type: "transfer",
        amount: params.amount,
        status: "completed",
        description: `Received money from user #${params.senderId}`,
        reference,
      }, tx);

      // 6. Persistence: Audit Logs (Rule 16)
      await this.paymentRepo.createAuditLog({
        userId: params.senderId,
        walletId: senderProps.id,
        action: "p2p_sent",
        previousBalance: previousSenderBalance,
        newBalance: senderProps.balance,
        entityType: "p2pTransfer",
        entityId: transferId,
        correlationId, // Rule 18
      }, tx);

      // 7. ATOMIC OUTBOX: Transfer Notification (Rule 2, 3)
      await this.paymentRepo.saveOutboxEvent({
        eventId: uuidv4(),
        aggregateType: "payment",
        aggregateId: transferId,
        eventType: "P2PTransferCompleted",
        version: 1,
        payload: {
          transferId,
          senderId: params.senderId,
          receiverId: params.receiverId,
          amount: params.amount,
          reference,
          correlationId,
        },
        correlationId,
        idempotencyKey: `p2p_notify_${transferId}`,
        status: "pending",
      }, tx);

      const result = { success: true, reference, transferId, correlationId };

      // 8. Mark as completed inside transaction
      await IdempotencyManager.markCompleted({
        idempotencyKey,
        result,
        correlationId,
        tx,
      });

      return result;
    });
  }
}

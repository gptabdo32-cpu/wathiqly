import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IPaymentRepository } from "../../domain/IPaymentRepository";
import { Decimal } from "decimal.js";

export interface SendMoneyInput {
  senderId: number;
  receiverId: number;
  amount: string;
  noteEncrypted?: string | null;
  ipAddress?: string;
}

export class SendMoney {
  constructor(private paymentRepo: IPaymentRepository) {}

  async execute(params: SendMoneyInput) {
    const amount = new Decimal(params.amount);
    
    return await TransactionManager.run(async (tx) => {
      // 1. Lock sender wallet
      const senderWallet = await this.paymentRepo.getWalletByUserId(params.senderId, tx);
      if (!senderWallet || new Decimal(senderWallet.balance).lt(amount)) {
        throw new Error("Insufficient funds.");
      }

      // 2. Lock receiver wallet
      const receiverWallet = await this.paymentRepo.getWalletByUserId(params.receiverId, tx);
      if (!receiverWallet) {
        throw new Error("Receiver wallet not found.");
      }

      const newSenderBalance = new Decimal(senderWallet.balance).minus(amount).toFixed(2);
      const newReceiverBalance = new Decimal(receiverWallet.balance).plus(amount).toFixed(2);
      const reference = `P2P-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // 3. Update Wallets via Repository
      await this.paymentRepo.updateWalletBalance(senderWallet.id, newSenderBalance, tx);
      await this.paymentRepo.updateWalletBalance(receiverWallet.id, newReceiverBalance, tx);

      // 4. Create P2P Record
      const transferId = await this.paymentRepo.createP2PTransfer({
        senderId: params.senderId,
        receiverId: params.receiverId,
        amount: params.amount,
        noteEncrypted: params.noteEncrypted,
        reference,
        status: "completed",
        ipAddress: params.ipAddress,
      }, tx);

      // 5. Create Transaction History for both
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

      // 6. Audit Logs
      await this.paymentRepo.createAuditLog({
        userId: params.senderId,
        walletId: senderWallet.id,
        action: "p2p_sent",
        previousBalance: senderWallet.balance,
        newBalance: newSenderBalance,
        entityType: "p2pTransfer",
        entityId: transferId,
      }, tx);

      // 7. ATOMIC OUTBOX: Transfer Notification
      await this.paymentRepo.saveOutboxEvent({
        aggregateType: "payment",
        aggregateId: transferId,
        eventType: "P2PTransferCompleted",
        payload: {
          transferId,
          senderId: params.senderId,
          receiverId: params.receiverId,
          amount: params.amount,
          reference,
        },
        status: "pending",
      }, tx);

      return { success: true, reference, transferId };
    });
  }
}

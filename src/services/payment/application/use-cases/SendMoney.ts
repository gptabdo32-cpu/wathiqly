import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IPaymentRepository } from "../../domain/IPaymentRepository";

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
    return await TransactionManager.run(async (tx) => {
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
      const reference = `P2P-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

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

      // 6. Persistence: Audit Logs
      await this.paymentRepo.createAuditLog({
        userId: params.senderId,
        walletId: senderProps.id,
        action: "p2p_sent",
        previousBalance: previousSenderBalance,
        newBalance: senderProps.balance,
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

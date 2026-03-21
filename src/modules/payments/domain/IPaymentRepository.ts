export interface IPaymentRepository {
  getWalletByUserId(userId: number, tx?: any): Promise<any>;
  
  updateWalletBalance(walletId: number, newBalance: string, tx?: any): Promise<void>;
  
  createP2PTransfer(data: {
    senderId: number;
    receiverId: number;
    amount: string;
    noteEncrypted?: string | null;
    reference: string;
    status: string;
    ipAddress?: string;
  }, tx?: any): Promise<number>;

  createTransactionHistory(data: {
    userId: number;
    type: string;
    amount: string;
    status: string;
    description: string;
    reference: string;
  }, tx?: any): Promise<void>;

  createAuditLog(data: {
    userId: number;
    walletId: number;
    action: string;
    previousBalance: string;
    newBalance: string;
    entityType: string;
    entityId: number;
  }, tx?: any): Promise<void>;

  saveOutboxEvent(event: {
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    payload: any;
    status: string;
  }, tx?: any): Promise<void>;
}

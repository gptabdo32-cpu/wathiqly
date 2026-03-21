export interface IPaymentService {
  createEscrowAccount(description: string, tx?: any): Promise<number>;
  lockEscrowFunds(escrowId: number, amount: string, escrowAccountId: number, tx?: any): Promise<void>;
  releaseEscrowFunds(escrowId: number, amount: string, escrowAccountId: number, sellerAccountId: number, tx?: any): Promise<void>;
  refundEscrowFunds(escrowId: number, amount: string, escrowAccountId: number, buyerAccountId: number, tx?: any): Promise<void>;
}

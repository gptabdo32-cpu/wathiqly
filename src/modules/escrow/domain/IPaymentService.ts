export interface IPaymentService {
  /**
   * Locks funds for an escrow contract.
   * This involves creating a system escrow account and recording the ledger transaction.
   */
  lockEscrowFunds(params: {
    escrowId: number;
    amount: string;
    description: string;
  }, tx?: any): Promise<{ escrowLedgerAccountId: number }>;

  /**
   * Releases funds from an escrow contract to the seller.
   */
  releaseEscrowFunds(params: {
    escrowId: number;
    amount: string;
    escrowLedgerAccountId: number;
    sellerLedgerAccountId: number;
  }, tx?: any): Promise<void>;

  /**
   * Refunds funds from an escrow contract back to the buyer.
   */
  refundEscrowFunds(params: {
    escrowId: number;
    amount: string;
    escrowLedgerAccountId: number;
    buyerLedgerAccountId: number;
  }, tx?: any): Promise<void>;
}

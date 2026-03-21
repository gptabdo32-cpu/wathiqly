export interface Escrow {
  id?: number;
  buyerId: number;
  sellerId: number;
  buyerLedgerAccountId: number;
  escrowLedgerAccountId: number;
  amount: string;
  status: 'locked' | 'released' | 'refunded' | 'disputed';
  description: string;
  blockchainStatus: 'pending' | 'synced' | 'none';
  onChainId?: number | null;
}

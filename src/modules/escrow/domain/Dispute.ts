export interface Dispute {
  id?: number;
  escrowId: number;
  initiatorId: number;
  reason: string;
  status: 'open' | 'resolved';
  resolution?: 'buyer_refund' | 'seller_payout';
  adminId?: number;
}

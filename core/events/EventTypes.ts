export enum EventType {
  // Ledger Events
  LEDGER_TRANSACTION_RECORDED = "ledger.transaction.recorded",
  LEDGER_ACCOUNT_CREATED = "ledger.account.created",
  LEDGER_INTEGRITY_FAILED = "ledger.integrity.failed",

  // Escrow Events
  ESCROW_FUNDS_LOCKED = "escrow.funds.locked",
  ESCROW_FUNDS_RELEASED = "escrow.funds.released",
  ESCROW_DISPUTE_OPENED = "escrow.dispute.opened",
  ESCROW_DISPUTE_RESOLVED = "escrow.dispute.resolved",

  // Security Events
  SECURITY_ALERT = "security.alert",
  SYSTEM_LOG = "system.log",
}

export interface EventPayloads {
  [EventType.LEDGER_TRANSACTION_RECORDED]: {
    transactionId: number;
    description: string;
    referenceType?: string;
    referenceId?: number;
  };
  [EventType.ESCROW_FUNDS_LOCKED]: {
    escrowId: number;
    buyerId: number;
    sellerId: number;
    amount: string;
  };
  [EventType.ESCROW_DISPUTE_OPENED]: {
    escrowId: number;
    initiatorId: number;
    reason: string;
  };
}

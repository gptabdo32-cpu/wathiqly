/**
 * ILedgerService Interface
 * Phase 3.7: Decoupling modules using Interfaces.
 * Defines the contract for ledger operations without exposing implementation details.
 */
export interface ILedgerService {
  getAccountBalance(accountId: number, tx?: any): Promise<number>;
  
  recordTransaction(params: {
    description: string;
    referenceType?: string;
    referenceId?: number;
    escrowContractId?: number;
    isSystemTransaction?: boolean;
    idempotencyKey?: string;
    entries: {
      accountId: number;
      debit: string;
      credit: string;
    }[];
  }, tx?: any): Promise<number>;

  createAccount(
    userId: number, 
    name: string, 
    type: "asset" | "liability" | "revenue" | "expense",
    tx?: any
  ): Promise<number>;
}

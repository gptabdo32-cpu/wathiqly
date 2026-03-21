import { IPaymentService } from "../domain/IPaymentService";
import { ILedgerService } from "../../blockchain/domain/ILedgerService";

export class LedgerPaymentService implements IPaymentService {
  constructor(private ledgerService: ILedgerService) {}

  async createEscrowAccount(description: string, tx?: any): Promise<number> {
    return await this.ledgerService.createAccount(
      0, // System user ID
      `Escrow Hold for ${description}`,
      "liability",
      tx
    );
  }

  async lockEscrowFunds(escrowId: number, amount: string, escrowAccountId: number, tx?: any): Promise<void> {
    await this.ledgerService.recordTransaction({
      description: `Locking funds for Escrow #${escrowId}`,
      referenceType: "escrow",
      referenceId: escrowId,
      escrowContractId: escrowId,
      idempotencyKey: `escrow_lock_${escrowId}`,
      entries: [
        { accountId: 1, debit: "0.0000", credit: amount }, // Simplified buyer account lookup
        { accountId: escrowAccountId, debit: amount, credit: "0.0000" },
      ],
    }, tx);
  }

  async releaseEscrowFunds(escrowId: number, amount: string, escrowAccountId: number, sellerAccountId: number, tx?: any): Promise<void> {
    await this.ledgerService.recordTransaction({
      description: `Releasing funds for Escrow #${escrowId}`,
      referenceType: "escrow",
      referenceId: escrowId,
      escrowContractId: escrowId,
      idempotencyKey: `escrow_release_${escrowId}`,
      entries: [
        { accountId: escrowAccountId, debit: "0.0000", credit: amount },
        { accountId: sellerAccountId, debit: amount, credit: "0.0000" },
      ],
    }, tx);
  }

  async refundEscrowFunds(escrowId: number, amount: string, escrowAccountId: number, buyerAccountId: number, tx?: any): Promise<void> {
    await this.ledgerService.recordTransaction({
      description: `Refunding funds for Escrow #${escrowId}`,
      referenceType: "escrow",
      referenceId: escrowId,
      escrowContractId: escrowId,
      idempotencyKey: `escrow_refund_${escrowId}`,
      entries: [
        { accountId: escrowAccountId, debit: "0.0000", credit: amount },
        { accountId: buyerAccountId, debit: amount, credit: "0.0000" },
      ],
    }, tx);
  }
}

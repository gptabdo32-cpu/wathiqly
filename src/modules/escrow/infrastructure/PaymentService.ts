import { IPaymentService } from "../domain/IPaymentService";
import { ILedgerService } from "../../blockchain/domain/ILedgerService";

export class PaymentService implements IPaymentService {
  constructor(private ledgerService: ILedgerService) {}

  async lockEscrowFunds(params: {
    escrowId: number;
    amount: string;
    description: string;
  }, tx?: any): Promise<{ escrowLedgerAccountId: number }> {
    // 1. Create a System Escrow Account
    const escrowAccountId = await this.ledgerService.createAccount(
      0, // System user ID
      `Escrow Hold for ${params.description}`,
      "liability",
      tx
    );

    // 2. Ledger: Move funds from buyer (simplified account 1) to escrow account
    await this.ledgerService.recordTransaction({
      description: `Locking funds for Escrow #${params.escrowId}`,
      referenceType: "escrow",
      referenceId: params.escrowId,
      escrowContractId: params.escrowId,
      idempotencyKey: `escrow_lock_${params.escrowId}`,
      entries: [
        { accountId: 1, debit: "0.0000", credit: params.amount }, // Simplified account lookup
        { accountId: escrowAccountId, debit: params.amount, credit: "0.0000" },
      ],
    }, tx);

    return { escrowLedgerAccountId: escrowAccountId };
  }

  async releaseEscrowFunds(params: {
    escrowId: number;
    amount: string;
    escrowLedgerAccountId: number;
    sellerLedgerAccountId: number;
  }, tx?: any): Promise<void> {
    await this.ledgerService.recordTransaction({
      description: `Releasing funds for Escrow #${params.escrowId}`,
      referenceType: "escrow",
      referenceId: params.escrowId,
      escrowContractId: params.escrowId,
      idempotencyKey: `escrow_release_${params.escrowId}`,
      entries: [
        { accountId: params.escrowLedgerAccountId, debit: "0.0000", credit: params.amount },
        { accountId: params.sellerLedgerAccountId, debit: params.amount, credit: "0.0000" },
      ],
    }, tx);
  }

  async refundEscrowFunds(params: {
    escrowId: number;
    amount: string;
    escrowLedgerAccountId: number;
    buyerLedgerAccountId: number;
  }, tx?: any): Promise<void> {
    await this.ledgerService.recordTransaction({
      description: `Refunding funds for Escrow #${params.escrowId}`,
      referenceType: "escrow",
      referenceId: params.escrowId,
      escrowContractId: params.escrowId,
      idempotencyKey: `escrow_refund_${params.escrowId}`,
      entries: [
        { accountId: params.escrowLedgerAccountId, debit: "0.0000", credit: params.amount },
        { accountId: params.buyerLedgerAccountId, debit: params.amount, credit: "0.0000" },
      ],
    }, tx);
  }
}

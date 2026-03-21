import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { IPaymentService } from "../../domain/IPaymentService";

export class OpenDispute {
  constructor(private escrowRepo: IEscrowRepository) {}

  async execute(escrowId: number, initiatorId: number, reason: string) {
    return await TransactionManager.run(async (tx) => {
      // 1. Persistence: Get escrow via Repository
      const escrow = await this.escrowRepo.getById(escrowId, tx);
      if (!escrow) throw new Error("Escrow not found");
      
      // 2. Domain Rule: Perform transition inside the Entity
      escrow.dispute();

      // 3. Persistence: Update status
      await this.escrowRepo.update(escrow, tx);

      // 4. Persistence: Create dispute record
      const disputeId = await this.escrowRepo.createDispute({
        escrowId,
        initiatorId,
        reason,
        status: "open",
      }, tx);

      // 5. ATOMIC OUTBOX: Internal Notification
      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowDisputeOpened",
        payload: { escrowId, initiatorId, reason, disputeId },
        status: "pending",
      }, tx);

      return disputeId;
    });
  }
}

export class ResolveDispute {
  constructor(
    private paymentService: IPaymentService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(disputeId: number, adminId: number, resolution: "buyer_refund" | "seller_payout") {
    return await TransactionManager.run(async (tx) => {
      // 1. Persistence: Get dispute and associated escrow
      const dispute = await this.escrowRepo.getDisputeById(disputeId, tx);
      if (!dispute || dispute.status !== "open") {
        throw new Error("Dispute not found or already resolved");
      }

      const escrow = await this.escrowRepo.getById(dispute.escrowId, tx);
      if (!escrow) throw new Error("Associated escrow contract not found");

      // 2. Domain Rule: Perform transition inside the Entity
      if (resolution === "buyer_refund") {
        escrow.refund();
      } else {
        escrow.release();
      }

      // 3. Persistence: Update dispute and escrow statuses
      await this.escrowRepo.updateDispute(disputeId, { status: "resolved", resolution, adminId }, tx);
      await this.escrowRepo.update(escrow, tx);

      const props = escrow.getProps();

      // 4. Infrastructure Logic: Transfer funds via PaymentService
      if (resolution === "buyer_refund") {
        await this.paymentService.refundEscrowFunds({
          escrowId: props.id!,
          amount: props.amount,
          escrowLedgerAccountId: props.escrowLedgerAccountId!,
          buyerLedgerAccountId: props.buyerLedgerAccountId!,
        }, tx);
      } else {
        await this.paymentService.releaseEscrowFunds({
          escrowId: props.id!,
          amount: props.amount,
          escrowLedgerAccountId: props.escrowLedgerAccountId!,
          sellerLedgerAccountId: 2, // Simplified seller lookup
        }, tx);
      }

      // 5. ATOMIC OUTBOX: Internal Notification
      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "dispute",
        aggregateId: disputeId,
        eventType: "EscrowDisputeResolved",
        payload: { disputeId, resolution, escrowId: props.id },
        status: "pending",
      }, tx);

      return true;
    });
  }
}

import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { EscrowDomainService } from "../../domain/EscrowDomainService";
import { IPaymentService } from "../../domain/IPaymentService";

export class OpenDispute {
  constructor(private escrowRepo: IEscrowRepository) {}

  async execute(escrowId: number, initiatorId: number, reason: string) {
    return await TransactionManager.run(async (tx) => {
      const contract = await this.escrowRepo.getById(escrowId, tx);
      if (!contract) throw new Error("Contract not found");
      
      EscrowDomainService.canOpenDispute(contract);

      await this.escrowRepo.updateStatus(escrowId, "disputed", tx);

      const disputeId = await this.escrowRepo.createDispute({
        escrowId,
        initiatorId,
        reason,
        status: "open",
      }, tx);

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
      const dispute = await this.escrowRepo.getDisputeById(disputeId, tx);
      if (!dispute || dispute.status !== "open") {
        throw new Error("Dispute not found or already resolved");
      }

      const contract = await this.escrowRepo.getById(dispute.escrowId, tx);
      if (!contract) throw new Error("Associated escrow contract not found");

      const nextStatus = resolution === "buyer_refund" ? "refunded" : "released";
      
      await this.escrowRepo.updateDispute(disputeId, { status: "resolved", resolution, adminId }, tx);
      await this.escrowRepo.updateStatus(contract.id, nextStatus, tx);

      if (resolution === "buyer_refund") {
        await this.paymentService.refundEscrowFunds(
          contract.id,
          contract.amount,
          contract.escrowLedgerAccountId,
          contract.buyerLedgerAccountId,
          tx
        );
      } else {
        await this.paymentService.releaseEscrowFunds(
          contract.id,
          contract.amount,
          contract.escrowLedgerAccountId,
          2, // Simplified seller lookup
          tx
        );
      }

      if (contract.blockchainStatus === "synced" && contract.onChainId !== null) {
        await this.escrowRepo.saveOutboxEvent({
          aggregateType: "dispute",
          aggregateId: disputeId,
          eventType: "DisputeResolutionRequested",
          payload: {
            disputeId,
            onChainId: contract.onChainId,
            milestoneId: 0,
            releaseToSeller: resolution === "seller_payout",
          },
          status: "pending",
        }, tx);
      }

      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "dispute",
        aggregateId: disputeId,
        eventType: "EscrowDisputeResolved",
        payload: { disputeId, resolution, escrowId: contract.id },
        status: "pending",
      }, tx);

      return true;
    });
  }
}

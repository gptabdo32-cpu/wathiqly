import { TransactionManager } from "../../../../core/db/TransactionManager";
import { ILedgerService } from "../../../blockchain/domain/ILedgerService";
import { IEscrowRepository } from "../../domain/IEscrowRepository";

export class OpenDispute {
  constructor(private escrowRepo: IEscrowRepository) {}

  async execute(escrowId: number, initiatorId: number, reason: string) {
    return await TransactionManager.run(async (tx) => {
      const contract = await this.escrowRepo.getById(escrowId, tx);
      if (!contract) throw new Error("Contract not found");
      
      if (contract.status !== "locked") {
        throw new Error(`Invalid Escrow transition: ${contract.status} -> disputed`);
      }

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
    private ledgerService: ILedgerService,
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

      const targetAccountId = resolution === "buyer_refund" ? contract.buyerLedgerAccountId : 2; // Simplified seller lookup

      await this.ledgerService.recordTransaction({
        description: `Resolving Dispute #${disputeId} via ${resolution}`,
        referenceType: "dispute",
        referenceId: disputeId,
        escrowContractId: contract.id,
        idempotencyKey: `dispute_resolve_${disputeId}`,
        entries: [
          { accountId: contract.escrowLedgerAccountId, debit: "0.0000", credit: contract.amount },
          { accountId: targetAccountId, debit: contract.amount, credit: "0.0000" },
        ],
      }, tx);

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

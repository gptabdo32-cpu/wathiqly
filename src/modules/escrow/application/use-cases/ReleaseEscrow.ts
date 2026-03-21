import { TransactionManager } from "../../../../core/db/TransactionManager";
import { IEscrowRepository } from "../../domain/IEscrowRepository";
import { EscrowDomainService } from "../../domain/EscrowDomainService";
import { IPaymentService } from "../../domain/IPaymentService";

export class ReleaseEscrow {
  constructor(
    private paymentService: IPaymentService,
    private escrowRepo: IEscrowRepository
  ) {}

  async execute(escrowId: number) {
    return await TransactionManager.run(async (tx) => {
      // 1. Get contract via Repository with transaction context
      const contract = await this.escrowRepo.getById(escrowId, tx);
      if (!contract) throw new Error("Contract not found");
      
      // 2. Domain Rule: Check transition
      EscrowDomainService.canReleaseEscrow(contract);

      // 3. Update status to released via Repository
      await this.escrowRepo.updateStatus(escrowId, "released", tx);

      // 4. Transfer funds from Escrow Hold to Seller Wallet via PaymentService
      await this.paymentService.releaseEscrowFunds(
        escrowId, 
        contract.amount, 
        contract.escrowLedgerAccountId, 
        2, // Simplified seller account ID, should be from contract or service
        tx
      );

      // 5. ATOMIC OUTBOX: Blockchain Sync
      if (contract.blockchainStatus === "synced" && contract.onChainId !== null) {
        await this.escrowRepo.saveOutboxEvent({
          aggregateType: "escrow",
          aggregateId: escrowId,
          eventType: "EscrowReleaseRequested",
          payload: {
            escrowId,
            onChainId: contract.onChainId,
            milestoneId: 0,
          },
          status: "pending",
        }, tx);
      }

      // 6. ATOMIC OUTBOX: Internal Notification
      await this.escrowRepo.saveOutboxEvent({
        aggregateType: "escrow",
        aggregateId: escrowId,
        eventType: "EscrowFundsReleased",
        payload: {
          escrowId,
          sellerId: contract.sellerId,
          amount: contract.amount,
        },
        status: "pending",
      }, tx);

      return true;
    });
  }
}

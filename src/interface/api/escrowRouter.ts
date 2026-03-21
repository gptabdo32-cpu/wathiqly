import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../trpc/trpc";
import { createEscrowSchema } from "./schemas/createEscrow";
import { openDisputeSchema, resolveDisputeSchema } from "./schemas/dispute";
import { CreateEscrow } from "../../modules/escrow/application/use-cases/CreateEscrow";
import { ReleaseEscrow } from "../../modules/escrow/application/use-cases/ReleaseEscrow";
import { OpenDispute, ResolveDispute } from "../../modules/escrow/application/use-cases/DisputeUseCases";
import { DrizzleEscrowRepository } from "../../modules/escrow/infrastructure/DrizzleEscrowRepository";
import { PaymentService } from "../../modules/escrow/infrastructure/PaymentService";
import { LedgerService } from "../../modules/blockchain/LedgerService";

// Helper to get dependencies (Temporary until DI container is implemented)
const getEscrowDependencies = () => {
  const ledgerService = new LedgerService();
  const paymentService = new PaymentService(ledgerService);
  const escrowRepo = new DrizzleEscrowRepository();
  return { paymentService, escrowRepo };
};

export const escrowRouter = router({
  create: protectedProcedure
    .input(createEscrowSchema)
    .mutation(async ({ ctx, input }) => {
      const { paymentService, escrowRepo } = getEscrowDependencies();
      const useCase = new CreateEscrow(paymentService, escrowRepo);
      const escrowId = await useCase.execute({
        buyerId: ctx.user.id,
        sellerId: input.sellerId,
        amount: input.amount,
        description: input.description,
        sellerWalletAddress: input.sellerWalletAddress,
      });
      return { success: true, escrowId };
    }),

  release: protectedProcedure
    .input(z.object({ escrowId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const { paymentService, escrowRepo } = getEscrowDependencies();
      const useCase = new ReleaseEscrow(paymentService, escrowRepo);
      const success = await useCase.execute(input.escrowId);
      return { success };
    }),

  openDispute: protectedProcedure
    .input(openDisputeSchema)
    .mutation(async ({ input }) => {
      const { escrowRepo } = getEscrowDependencies();
      const useCase = new OpenDispute(escrowRepo);
      const disputeId = await useCase.execute(
        input.escrowId,
        input.initiatorId,
        input.reason
      );
      return { success: true, disputeId };
    }),

  resolveDispute: adminProcedure
    .input(resolveDisputeSchema)
    .mutation(async ({ input }) => {
      const { paymentService, escrowRepo } = getEscrowDependencies();
      const useCase = new ResolveDispute(paymentService, escrowRepo);
      const success = await useCase.execute(
        input.disputeId,
        input.adminId,
        input.resolution
      );
      return { success };
    }),
});

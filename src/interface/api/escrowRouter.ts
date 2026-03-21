import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../trpc/trpc";
import { createEscrowSchema } from "./schemas/createEscrow";
import { openDisputeSchema, resolveDisputeSchema } from "./schemas/dispute";
import { Container } from "../../core/di/container";

export const escrowRouter = router({
  create: protectedProcedure
    .input(createEscrowSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = Container.getCreateEscrow();
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
      const useCase = Container.getReleaseEscrow();
      const success = await useCase.execute(input.escrowId);
      return { success };
    }),

  openDispute: protectedProcedure
    .input(openDisputeSchema)
    .mutation(async ({ input }) => {
      const useCase = Container.getOpenDispute();
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
      const useCase = Container.getResolveDispute();
      const success = await useCase.execute(
        input.disputeId,
        input.adminId,
        input.resolution
      );
      return { success };
    }),
});

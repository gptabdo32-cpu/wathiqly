import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../trpc/trpc";
import { createEscrowSchema } from "./schemas/createEscrow";
import { openDisputeSchema, resolveDisputeSchema } from "./schemas/dispute";
import { EscrowEngine } from "../../modules/escrow/EscrowEngine";

export const escrowRouter = router({
  create: protectedProcedure
    .input(createEscrowSchema)
    .mutation(async ({ ctx, input }) => {
      const escrowId = await EscrowEngine.lockFunds({
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
      const success = await EscrowEngine.releaseFunds(input.escrowId);
      return { success };
    }),

  openDispute: protectedProcedure
    .input(openDisputeSchema)
    .mutation(async ({ input }) => {
      const disputeId = await EscrowEngine.openDispute(
        input.escrowId,
        input.initiatorId,
        input.reason
      );
      return { success: true, disputeId };
    }),

  resolveDispute: adminProcedure
    .input(resolveDisputeSchema)
    .mutation(async ({ input }) => {
      const success = await EscrowEngine.resolveDispute(
        input.disputeId,
        input.adminId,
        input.resolution
      );
      return { success };
    }),
});

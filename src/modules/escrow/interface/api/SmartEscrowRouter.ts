import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { SmartEscrowApplicationService } from "../../application/services/SmartEscrowApplicationService";
import { DrizzleEscrowRepository } from "../../infrastructure/DrizzleEscrowRepository";
import { AccessControl } from "../../../../core/security/access-control/AccessControl";

// Dependency Injection (Manual for now, can be moved to a DI container)
const escrowRepository = new DrizzleEscrowRepository();
const smartEscrowService = new SmartEscrowApplicationService(
  escrowRepository,
  (db as any).auditLogs, // Placeholder for AuditLogRepository
  null, // Placeholder for AiArbitratorService
  null  // Placeholder for IotService
);

/**
 * Smart Escrow Router (Interface Layer)
 * MISSION: Request/Response mapping only. No business logic.
 */
export const smartEscrowRouter = router({
  /**
   * Add milestones to an escrow
   */
  addMilestones: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        milestones: z.array(
          z.object({
            title: z.string().min(3),
            description: z.string().optional(),
            amount: z.string(),
            verificationType: z.enum(["manual", "github_commit", "github_pr", "url_check", "external_api"]).default("manual"),
            verificationData: z.any().optional(),
            requiresSignature: z.boolean().default(false),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await smartEscrowService.addMilestones(
        ctx.user.id,
        input.escrowId,
        input.milestones
      );
    }),

  /**
   * Analyze escrow contract with AI
   */
  analyzeEscrowContract: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await smartEscrowService.analyzeEscrowContract(
        ctx.user.id,
        input.escrowId
      );
    }),
});

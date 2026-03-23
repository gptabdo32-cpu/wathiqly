import { z } from "zod";
import { v4 as uuidv4 } from 'uuid'; // Import uuid for correlationId generation
import { Logger } from "../../core/observability/Logger"; // Import Logger
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(({ ctx }) => {
      const correlationId = ctx.correlationId || uuidv4(); // Use existing or generate new
      Logger.info("Health check requested", { correlationId });
      return {
        ok: true,
        correlationId,
      };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const correlationId = ctx.correlationId || uuidv4(); // Use existing or generate new
      Logger.info("Notify owner request received", { correlationId, title: input.title });
      const delivered = await notifyOwner(input, correlationId); // Pass correlationId
      return {
        success: delivered,
        correlationId,
      } as const;
    }),
});

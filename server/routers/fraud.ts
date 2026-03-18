import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { FraudDetector } from "../fraud_ai_logic";
import { getUserGraph, detectSybilClusters } from "../db_fraud_graph";
import { getDb } from "../db";
import { fraudClusters, fraudNodes } from "../../drizzle/schema_fraud_graph";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const fraudRouter = router({
  /**
   * Get the risk analysis for the current user (used for self-monitoring or UI indicators)
   */
  getMyRiskStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const node = await db
      .select()
      .from(fraudNodes)
      .where(
        z.and(
          eq(fraudNodes.nodeType, "user"),
          eq(fraudNodes.nodeValue, ctx.user.id.toString())
        )
      )
      .limit(1);

    return node.length > 0 ? node[0] : { riskScore: "0.00", metadata: {} };
  }),

  /**
   * ADMIN: Get full graph for any user
   */
  getUserNetwork: adminProcedure
    .input(z.object({ userId: z.number(), depth: z.number().default(2) }))
    .query(async ({ input }) => {
      const graph = await getUserGraph(input.userId, input.depth);
      if (!graph) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found in fraud graph",
        });
      }
      return graph;
    }),

  /**
   * ADMIN: List detected fraud clusters/rings
   */
  getDetectedClusters: adminProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      return await db
        .select()
        .from(fraudClusters)
        .orderBy(desc(fraudClusters.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * ADMIN: Trigger a manual scan for fraud rings
   */
  triggerFraudScan: adminProcedure.mutation(async () => {
    try {
      await FraudDetector.detectFraudRings();
      return { success: true, message: "Fraud scan started in background" };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to trigger fraud scan",
      });
    }
  }),

  /**
   * ADMIN: Review and update cluster status
   */
  updateClusterStatus: adminProcedure
    .input(
      z.object({
        clusterId: z.number(),
        status: z.enum(["under_review", "confirmed", "dismissed"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .update(fraudClusters)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(fraudClusters.id, input.clusterId));

      return { success: true };
    }),
});

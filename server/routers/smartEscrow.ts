import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createMilestones,
  getEscrowMilestones,
  updateMilestoneStatus,
  registerIotDevice,
  getEscrowIotDevices,
  updateIotReading,
  logBlockchainTx,
  getEscrowBlockchainLogs,
  addMilestoneSignature,
  getMilestoneSignatures,
} from "../db_smart_escrow";
import { getEscrowById, updateEscrowStatus } from "../db";
import { encryptData, decryptData } from "../_core/encryption"; // Import encryption utilities
import { generateSecureToken } from "../_core/utils"; // Assuming a utility to generate tokens
import { createAuditLog } from "../db-enhanced";

export const smartEscrowRouter = router({
  // ============ MILESTONES ============
  
  /**
   * Add milestones to an existing escrow
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
            requiresSignature: z.boolean().default(false), // New field for digital signature requirement
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });
      
      // Only seller or buyer can add milestones (usually seller proposes, buyer approves)
      if (escrow.sellerId !== ctx.user.id && escrow.buyerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      const milestones = input.milestones.map(m => ({
        ...m,
        escrowId: input.escrowId,
        status: "pending" as const,
      }));

      await createMilestones(milestones);
      
      await createAuditLog({
        userId: ctx.user.id,
        action: "milestones_added",
        entityType: "escrow",
        entityId: input.escrowId,
        newValue: { count: milestones.length },
      });

      return { success: true };
    }),

  getMilestones: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .query(async ({ input }) => {
      return await getEscrowMilestones(input.escrowId);
    }),

  updateMilestone: protectedProcedure
    .input(
      z.object({
        milestoneId: z.number(),
        status: z.enum(["pending", "in_progress", "completed", "released", "disputed"]),
        verificationData: z.any().optional(),
        signature: z.string().optional(), // Optional signature when updating to 'completed' or 'released'
      })
    )
    .mutation(async ({ ctx, input }) => {
      // In a real app, we'd check permissions here and verify signature if required
      await updateMilestoneStatus(input.milestoneId, input.status, input.verificationData);
      
      await createAuditLog({
        userId: ctx.user.id,
        action: "milestone_updated",
        entityType: "milestone",
        entityId: input.milestoneId,
        newValue: { status: input.status },
      });

      return { success: true };
    }),

  // ============ IOT INTEGRATION ============

  registerDevice: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        deviceId: z.string(),
        deviceType: z.enum(["gps_tracker", "temp_sensor", "humidity_sensor", "impact_sensor", "smart_lock"]),
        config: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });

      const secureToken = generateSecureToken(); // Generate a secure token
      await registerIotDevice({
        ...input,
        secureToken,
        status: "active",
      });

      await createAuditLog({
        userId: ctx.user.id,
        action: "iot_device_registered",
        entityType: "escrow",
        entityId: input.escrowId,
        newValue: { deviceId: input.deviceId, type: input.deviceType },
      });

      // Return the secureToken to the device for future authentication
      return { success: true, secureToken };
    }),

  /**
   * Public endpoint for IoT devices to report data (secured by deviceId/token in real app)
   */
  reportIotData: publicProcedure
    .input(
      z.object({
        deviceId: z.string(),
        secureToken: z.string(), // Require secureToken for authentication
        reading: z.any(),
        status: z.enum(["active", "inactive", "triggered", "tampered"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Authenticate device using secureToken
      const devices = await getEscrowIotDevices(0); // Fetch all devices for now, will refine later
      const device = devices.find(d => d.deviceId === input.deviceId && d.secureToken === input.secureToken);
      if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid device or token" });

      // Encrypt sensitive readings before storing
      const encryptedReading = encryptData(JSON.stringify(input.reading));

      await updateIotReading(input.deviceId, input.reading, input.status, encryptedReading);
      
      // Logic for automatic escrow release based on IoT data would go here
      // e.g., if deviceType is gps_tracker and reading is within target radius
      
      return { success: true };
    }),

  getDevices: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .query(async ({ input }) => {
      return await getEscrowIotDevices(input.escrowId);
    }),

  // ============ BLOCKCHAIN TRANSPARENCY ============

  getBlockchainLogs: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .query(async ({ input }) => {
      return await getEscrowBlockchainLogs(input.escrowId);
    }),

  /**
   * Log a blockchain transaction (called by backend after on-chain action)
   */
  logTransaction: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        action: z.string(),
        txHash: z.string(),
        network: z.string().optional(),
        metadata: z.any().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await logBlockchainTx(input);
      return { success: true };
    }),

  // ============ MILESTONE SIGNATURES ============

  /**
   * Add a digital signature to a milestone
   */
  signMilestone: protectedProcedure
    .input(
      z.object({
        milestoneId: z.number(),
        signature: z.string(), // Digital signature from the user
      })
    )
    .mutation(async ({ ctx, input }) => {
      // In a real app, we'd verify the signature against the user's public key
      await addMilestoneSignature({
        milestoneId: input.milestoneId,
        userId: ctx.user.id,
        signature: input.signature,
      });

      await createAuditLog({
        userId: ctx.user.id,
        action: "milestone_signed",
        entityType: "milestone",
        entityId: input.milestoneId,
        newValue: { signature: input.signature },
      });

      return { success: true };
    }),

  getMilestoneSignatures: protectedProcedure
    .input(z.object({ milestoneId: z.number() }))
    .query(async ({ input }) => {
      return await getMilestoneSignatures(input.milestoneId);
    }),
});

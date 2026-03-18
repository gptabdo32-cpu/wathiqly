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
import { invokeLLM } from "../_core/llm";
import { createAiArbitratorAnalysis, getLatestAiArbitratorAnalysis } from "../db_ai_arbitrator";

export const smartEscrowRouter = router({
  // ============ AI ARBITRATOR ============

  analyzeEscrowContract: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });

      // Only seller or buyer can request analysis
      if (escrow.sellerId !== ctx.user.id && escrow.buyerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      // Construct the contract text for LLM analysis
      const contractText = `
        عنوان العقد: ${escrow.title}
        وصف العقد: ${escrow.description || 'لا يوجد وصف.'}
        المبلغ: ${escrow.amount}
        نوع الصفقة: ${escrow.dealType}
        المواصفات: ${JSON.stringify(escrow.specifications || {})}
        حالة العقد: ${escrow.status}
        
        الرجاء تحليل هذا العقد الذكي من منظور قانوني، مع التركيز على العدالة، الثغرات المحتملة، والبنود غير الواضحة. قم بتقديم ملخص باللغة العربية، ودرجة عدالة (0-100)، ومستوى المخاطر القانونية (low, medium, high, critical)، وأي ثغرات قانونية، وتوصيات لتحسين العقد، وتحليل مفصل للبنود الهامة.
      `;

      try {
        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: "أنت مساعد قانوني متخصص في تحليل العقود الذكية وتقديم المشورة القانونية." },
            { role: "user", content: contractText },
          ],
          outputSchema: {
            name: "LegalAnalysis",
            schema: {
              type: "object",
              properties: {
                fairnessScore: { type: "integer", minimum: 0, maximum: 100 },
                legalRiskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
                loopholes: { type: "array", items: { type: "string" } },
                recommendations: { type: "array", items: { type: "string" } },
                clauses_analysis: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      clause: { type: "string" },
                      status: { type: "string", enum: ["fair", "unfair", "ambiguous"] },
                      comment: { type: "string" },
                    },
                    required: ["clause", "status", "comment"],
                  },
                },
                summary: { type: "string" },
              },
              required: ["fairnessScore", "legalRiskLevel", "loopholes", "recommendations", "clauses_analysis", "summary"],
            },
          },
        });

        const analysisResults = llmResponse.choices[0].message.content as any;

        const newAnalysis = await createAiArbitratorAnalysis({
          escrowId: input.escrowId,
          fairnessScore: analysisResults.fairnessScore,
          legalRiskLevel: analysisResults.legalRiskLevel,
          analysisResults: analysisResults,
          summary: analysisResults.summary,
          modelUsed: llmResponse.model,
          tokensUsed: llmResponse.usage?.total_tokens,
          status: "completed",
        });

        await createAuditLog({
          userId: ctx.user.id,
          action: "ai_arbitrator_analysis_completed",
          entityType: "escrow",
          entityId: input.escrowId,
          newValue: { analysisId: newAnalysis.insertId, score: analysisResults.fairnessScore, risk: analysisResults.legalRiskLevel },
        });

        return { success: true, analysisId: newAnalysis.insertId };
      } catch (error: any) {
        console.error("AI Arbitrator analysis failed:", error);
        await createAuditLog({
          userId: ctx.user.id,
          action: "ai_arbitrator_analysis_failed",
          entityType: "escrow",
          entityId: input.escrowId,
          newValue: { error: error.message },
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to analyze contract with AI." });
      }
    }),

  getEscrowAnalysis: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .query(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Escrow not found" });

      // Only seller or buyer can view analysis
      if (escrow.sellerId !== ctx.user.id && escrow.buyerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      return await getLatestAiArbitratorAnalysis(input.escrowId);
    }),
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

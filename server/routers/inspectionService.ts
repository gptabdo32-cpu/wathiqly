import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { inspectionReports } from "../drizzle/schema_new_features";
import {
  createInspectionReport,
  getInspectionReportById,
  getInspectionReportByEscrowId,
  updateInspectionReportStatus,
  getAllInspectionAgents,
  getInspectionAgentByUserId,
  getFeatureSettings,
} from "../db_new_features";
import { getEscrowById, getUserById } from "../db";

export const inspectionServiceRouter = router({
  /**
   * Request inspection for an escrow
   */
  requestInspection: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        specialtyRequired: z.string().optional(), // e.g., "cars", "electronics"
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get escrow
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Escrow not found",
        });
      }

      // Verify user is the buyer
      if (escrow.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the buyer can request inspection",
        });
      }

      // Check if inspection is already requested
      const existingReport = await getInspectionReportByEscrowId(input.escrowId);
      if (existingReport) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Inspection already requested for this escrow",
        });
      }

      // Check if feature is enabled
      const settings = await getFeatureSettings();
      if (!settings.inspectionServiceEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Inspection service is currently disabled",
        });
      }

      // Get available agents
      const agents = await getAllInspectionAgents();
      if (agents.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No inspection agents available",
        });
      }

      // Filter by specialty if required
      let selectedAgent = agents[0];
      if (input.specialtyRequired) {
        const filteredAgents = agents.filter((agent) => {
          const specialties = (agent.specialties as string[]) || [];
          return specialties.includes(input.specialtyRequired!);
        });

        if (filteredAgents.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No inspection agents available for specialty: ${input.specialtyRequired}`,
          });
        }

        selectedAgent = filteredAgents[0];
      }

      // Create inspection report
      const reportResult = await createInspectionReport({
        escrowId: input.escrowId,
        inspectorId: selectedAgent.userId,
        summary: "",
        status: "pending",
      });

      return {
        success: true,
        reportId: reportResult[0].insertId,
        assignedAgent: {
          id: selectedAgent.id,
          name: selectedAgent.agentName,
          location: selectedAgent.location,
        },
      };
    }),

  /**
   * Get inspection report for an escrow
   */
  getReport: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .query(async ({ ctx, input }) => {
      const escrow = await getEscrowById(input.escrowId);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Escrow not found",
        });
      }

      const report = await getInspectionReportByEscrowId(input.escrowId);
      if (!report) {
        return null;
      }

      // Verify user is part of the escrow or the assigned inspector or admin
      if (
        escrow.buyerId !== ctx.user.id &&
        escrow.sellerId !== ctx.user.id &&
        report.inspectorId !== ctx.user.id &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view this report",
        });
      }

      // Get inspector info
      const inspector = await getUserById(report.inspectorId);

      return {
        ...report,
        inspector: {
          id: inspector?.id,
          name: inspector?.name,
          profileImage: inspector?.profileImage,
        },
      };
    }),

  /**
   * Submit inspection report (by inspector)
   */
  submitReport: protectedProcedure
    .input(
      z.object({
        reportId: z.number(),
        summary: z.string().min(10, "Summary must be at least 10 characters"),
        conditionScore: z.number().min(1).max(10),
        findings: z.object({
          exterior: z.string().optional(),
          interior: z.string().optional(),
          functional: z.string().optional(),
          defects: z.array(z.string()).optional(),
        }),
        mediaUrls: z.array(z.string().url()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await getInspectionReportById(input.reportId);
      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      // Verify user is the assigned inspector
      if (report.inspectorId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this inspection",
        });
      }

      // Verify report is still pending
      if (report.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot submit report with status: ${report.status}`,
        });
      }

      // Update report with findings and media
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(inspectionReports)
        .set({
          summary: input.summary,
          conditionScore: input.conditionScore,
          findings: input.findings,
          mediaUrls: input.mediaUrls,
          status: "completed",
          isVerified: true,
          verifiedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(inspectionReports.id, input.reportId));

      return {
        success: true,
        message: "Report submitted successfully",
      };
    }),

  /**
   * Approve inspection report (by buyer)
   */
  approveReport: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const report = await getInspectionReportById(input.reportId);
      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      // Get escrow
      const escrow = await getEscrowById(report.escrowId!);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Related escrow not found",
        });
      }

      // Verify user is the buyer
      if (escrow.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the buyer can approve the report",
        });
      }

      // Verify report is completed
      if (report.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report must be completed before approval",
        });
      }

      // Approve report
      await updateInspectionReportStatus(input.reportId, "approved");

      return {
        success: true,
        message: "Report approved. You can now proceed with payment.",
      };
    }),

  /**
   * Reject inspection report (by buyer)
   */
  rejectReport: protectedProcedure
    .input(
      z.object({
        reportId: z.number(),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await getInspectionReportById(input.reportId);
      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      // Get escrow
      const escrow = await getEscrowById(report.escrowId!);
      if (!escrow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Related escrow not found",
        });
      }

      // Verify user is the buyer
      if (escrow.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the buyer can reject the report",
        });
      }

      // Reject report
      await updateInspectionReportStatus(input.reportId, "rejected");

      // TODO: Handle rejection - possibly request new inspection or cancel escrow

      return {
        success: true,
        message: "Report rejected. A new inspection can be requested.",
      };
    }),

  /**
   * Get inspection agents
   */
  getAgents: protectedProcedure.query(async () => {
    const agents = await getAllInspectionAgents();
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.agentName,
      location: agent.location,
      specialties: agent.specialties,
      rating: agent.rating,
    }));
  }),

  /**
   * Get inspection statistics (admin)
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    }

    // TODO: Implement admin stats for inspections
    return {
      totalInspections: 0,
      completedInspections: 0,
      pendingInspections: 0,
      approvedReports: 0,
      rejectedReports: 0,
    };
  }),
});

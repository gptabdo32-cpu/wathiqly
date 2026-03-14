import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getPendingMediatorRequests,
  assignMediatorToRequest,
  getMediatorRequestsByConversation,
} from "../db_mediator";
import { getUserById } from "../db";
import { createAuditLog } from "./db-enhanced";

/**
 * Admin/Mediator Management Router
 * Handles assignment, statistics, and management of mediators
 */
export const mediatorAdminRouter = router({
  /**
   * Get pending mediator requests (for admin assignment)
   */
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can view pending requests",
        });
      }

      return await getPendingMediatorRequests();
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch pending requests",
      });
    }
  }),

  /**
   * Assign mediator to a request
   */
  assignMediator: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        mediatorId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if user is admin
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only admins can assign mediators",
          });
        }

        // Verify mediator exists and is a mediator
        const mediator = await getUserById(input.mediatorId);
        if (!mediator || !mediator.isMediator) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid mediator selected",
          });
        }

        // Assign mediator
        await assignMediatorToRequest(input.requestId, input.mediatorId);

        // Create audit log
        await createAuditLog({
          userId: ctx.user.id,
          action: "mediator_assigned",
          entityType: "mediator_request",
          entityId: input.requestId,
          newValue: { mediatorId: input.mediatorId },
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });

        return {
          success: true,
          message: "Mediator assigned successfully",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to assign mediator",
        });
      }
    }),

  /**
   * Get mediator statistics
   */
  getMediatorStats: protectedProcedure
    .input(z.object({ mediatorId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        // Check if user is the mediator or admin
        if (ctx.user.id !== input.mediatorId && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied",
          });
        }

        const mediator = await getUserById(input.mediatorId);
        if (!mediator || !mediator.isMediator) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Mediator not found",
          });
        }

        return {
          mediatorId: mediator.id,
          name: mediator.name,
          rating: mediator.mediatorRating || 0,
          casesResolved: mediator.mediatorCasesResolved || 0,
          isAvailable: mediator.mediatorIsAvailable,
          joinedAt: mediator.createdAt,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch mediator stats",
        });
      }
    }),

  /**
   * Get all available mediators
   */
  getAvailableMediators: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can view available mediators",
        });
      }

      // This would typically query from database
      // For now, returning a placeholder
      return {
        message: "Implement query to get available mediators from database",
        count: 0,
        mediators: [],
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch available mediators",
      });
    }
  }),
});

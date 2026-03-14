import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createMediatorRequest,
  getMediatorRequestById,
  getPendingMediatorRequests,
  assignMediatorToRequest,
  updateMediatorRequestStatus,
  addMediatorMessage,
  getMediatorMessagesInConversation,
  createMediatorPrivateChat,
  getMediatorPrivateChat,
  addMediatorPrivateMessage,
  getMediatorPrivateChatMessages,
  createMediatorDecision,
  getMediatorDecisionByEscrow,
  freezeEscrowByMediator,
  unfreezeEscrowByMediator,
  getMediatorRequestsByConversation,
  getActiveMediatorRequest,
} from "../db_mediator";
import {
  getConversation,
  getEscrowById,
  getOrCreateWallet,
  createTransaction,
  getUserById,
} from "../db";
import { createAuditLog } from "./db-enhanced";
import { Decimal } from "decimal.js";

const MEDIATOR_FEE = 10; // 10 LYD

export const mediatorRouter = router({
  /**
   * Request a mediator for a conversation
   */
  requestMediator: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        reason: z.string().min(10).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify conversation exists and user is participant
        const conversation = await getConversation(input.conversationId);
        if (!conversation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        }

        if (
          conversation.buyerId !== ctx.user.id &&
          conversation.sellerId !== ctx.user.id
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a participant in this conversation",
          });
        }

        // Check if there's already an active mediator request
        const activeRequest = await getActiveMediatorRequest(input.conversationId);
        if (activeRequest) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "There is already an active mediator request for this conversation",
          });
        }

        // Get user's wallet and check balance
        const wallet = await getOrCreateWallet(ctx.user.id);
        const balance = new Decimal(wallet.balance);
        const fee = new Decimal(MEDIATOR_FEE);

        if (balance.lt(fee)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient balance. You need ${MEDIATOR_FEE} LYD to request a mediator`,
          });
        }

        // Deduct fee from wallet
        const newBalance = balance.minus(fee).toFixed(2);
        await getDb()
          ?.update(wallets)
          .set({ balance: newBalance, updatedAt: new Date() })
          .where(eq(wallets.userId, ctx.user.id));

        // Create transaction record for fee
        const feeTransaction = await createTransaction({
          userId: ctx.user.id,
          type: "commission",
          amount: MEDIATOR_FEE.toString(),
          status: "completed",
          description: "Mediator request fee",
        });

        // Create mediator request
        const result = await createMediatorRequest({
          conversationId: input.conversationId,
          escrowId: conversation.escrowId,
          requestedBy: ctx.user.id,
          reason: input.reason,
          fee: MEDIATOR_FEE.toString(),
          feeTransactionId: feeTransaction[0].insertId,
          status: "pending",
        });

        // Add system message to conversation
        await addMediatorMessage({
          mediatorRequestId: result[0].insertId,
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: "text",
          content: `تم طلب وسيط. سيتم تعيين وسيط في غضون ساعتين. الرسالة: ${input.reason}`,
          isSystemMessage: true,
        });

        // Create audit log
        await createAuditLog({
          userId: ctx.user.id,
          action: "mediator_requested",
          entityType: "mediator_request",
          entityId: result[0].insertId,
          newValue: { conversationId: input.conversationId, reason: input.reason },
          ipAddress: ctx.req.ip,
          userAgent: ctx.req.headers["user-agent"],
        });

        return {
          success: true,
          mediatorRequestId: result[0].insertId,
          message: "تم طلب الوسيط بنجاح. سيتم تعيين وسيط في غضون ساعتين.",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to request mediator",
        });
      }
    }),

  /**
   * Get mediator request details
   */
  getMediatorRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const request = await getMediatorRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mediator request not found" });
        }

        // Verify user is involved in this request
        const conversation = await getConversation(request.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          // Allow mediators to view their own requests
          if (request.mediatorId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
        }

        return request;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch mediator request",
        });
      }
    }),

  /**
   * Get mediator messages in a conversation
   */
  getMediatorMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const conversation = await getConversation(input.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        return await getMediatorMessagesInConversation(
          input.conversationId,
          input.limit,
          input.offset
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch mediator messages",
        });
      }
    }),

  /**
   * Send mediator message to conversation
   */
  sendMediatorMessage: protectedProcedure
    .input(
      z.object({
        mediatorRequestId: z.number(),
        conversationId: z.number(),
        content: z.string().min(1).max(2000),
        messageType: z.enum(["text", "decision", "freeze", "unfreeze", "evidence_request"]).default("text"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify mediator
        const request = await getMediatorRequestById(input.mediatorRequestId);
        if (!request || request.mediatorId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only assigned mediator can send messages",
          });
        }

        const result = await addMediatorMessage({
          mediatorRequestId: input.mediatorRequestId,
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: input.messageType,
          content: input.content,
          isSystemMessage: false,
        });

        return {
          success: true,
          messageId: result[0].insertId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send mediator message",
        });
      }
    }),

  /**
   * Start private chat with mediator
   */
  startPrivateChatWithMediator: protectedProcedure
    .input(z.object({ mediatorRequestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const request = await getMediatorRequestById(input.mediatorRequestId);
        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mediator request not found" });
        }

        const conversation = await getConversation(request.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        // Check if private chat already exists
        let privateChat = await getMediatorPrivateChat(input.mediatorRequestId, ctx.user.id);
        if (!privateChat) {
          // Create new private chat
          const result = await createMediatorPrivateChat({
            mediatorRequestId: input.mediatorRequestId,
            mediatorId: request.mediatorId!,
            userId: ctx.user.id,
          });
          privateChat = { id: result[0].insertId } as any;
        }

        return {
          success: true,
          privateChatId: privateChat.id,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start private chat",
        });
      }
    }),

  /**
   * Send message in private mediator chat
   */
  sendPrivateMediatorMessage: protectedProcedure
    .input(
      z.object({
        privateChatId: z.number(),
        content: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify user is part of this private chat
        const privateChat = await getMediatorPrivateChat(input.privateChatId, ctx.user.id);
        if (!privateChat && privateChat?.mediatorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const result = await addMediatorPrivateMessage({
          privateChatId: input.privateChatId,
          senderId: ctx.user.id,
          content: input.content,
          messageType: "text",
        });

        return {
          success: true,
          messageId: result[0].insertId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send private message",
        });
      }
    }),

  /**
   * Get private chat messages
   */
  getPrivateChatMessages: protectedProcedure
    .input(
      z.object({
        privateChatId: z.number(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await getMediatorPrivateChatMessages(
          input.privateChatId,
          input.limit,
          input.offset
        );
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch private chat messages",
        });
      }
    }),

  /**
   * Make mediator decision
   */
  makeMediatorDecision: protectedProcedure
    .input(
      z.object({
        mediatorRequestId: z.number(),
        decisionType: z.enum(["release_to_seller", "refund_to_buyer", "split", "custom"]),
        buyerAmount: z.string().optional(),
        sellerAmount: z.string().optional(),
        reason: z.string().min(10).max(1000),
        evidence: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const request = await getMediatorRequestById(input.mediatorRequestId);
        if (!request || request.mediatorId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only assigned mediator can make decisions",
          });
        }

        const result = await createMediatorDecision({
          mediatorRequestId: input.mediatorRequestId,
          escrowId: request.escrowId,
          mediatorId: ctx.user.id,
          decisionType: input.decisionType,
          buyerAmount: input.buyerAmount,
          sellerAmount: input.sellerAmount,
          reason: input.reason,
          evidence: input.evidence,
        });

        // Update mediator request status to resolved
        await updateMediatorRequestStatus(
          input.mediatorRequestId,
          "resolved",
          `Decision: ${input.decisionType}`
        );

        return {
          success: true,
          decisionId: result[0].insertId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to make mediator decision",
        });
      }
    }),

  /**
   * Freeze escrow (mediator only)
   */
  freezeEscrow: protectedProcedure
    .input(
      z.object({
        mediatorRequestId: z.number(),
        reason: z.string().min(5).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const request = await getMediatorRequestById(input.mediatorRequestId);
        if (!request || request.mediatorId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only assigned mediator can freeze escrows",
          });
        }

        await freezeEscrowByMediator(
          input.mediatorRequestId,
          request.escrowId,
          ctx.user.id,
          input.reason
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to freeze escrow",
        });
      }
    }),
});

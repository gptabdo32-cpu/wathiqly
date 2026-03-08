import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createConversation,
  getConversation,
  getUserConversations,
  createMessage,
  getConversationMessages,
  markMessageAsRead,
  deleteMessage,
  addMessageReaction,
  uploadAttachment,
} from "../db";
import { storagePut } from "../storage";

export const chatRouter = router({
  // Create a new conversation
  createConversation: protectedProcedure
    .input(
      z.object({
        escrowId: z.number(),
        otherUserId: z.number(),
        subject: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createConversation({
          escrowId: input.escrowId,
          buyerId: Math.min(ctx.user.id, input.otherUserId),
          sellerId: Math.max(ctx.user.id, input.otherUserId),
          subject: input.subject,
        });

        return {
          success: true,
          conversationId: result[0].insertId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create conversation",
        });
      }
    }),

  // Get user conversations
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getUserConversations(ctx.user.id);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch conversations",
      });
    }
  }),

  // Get conversation details
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      try {
        const result = await getConversation(input.conversationId);
        return result[0] || null;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch conversation",
        });
      }
    }),

  // Get conversation messages
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        return await getConversationMessages(
          input.conversationId,
          input.limit,
          input.offset
        );
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch messages",
        });
      }
    }),

  // Send text message
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1),
        isEncrypted: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: "text",
          content: input.content,
          isEncrypted: input.isEncrypted || false,
        });

        return {
          success: true,
          messageId: result[0].insertId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send message",
        });
      }
    }),

  // Send image message
  sendImage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        imageData: z.string(), // Base64 encoded image
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Upload image to S3
        const buffer = Buffer.from(input.imageData, "base64");
        const fileKey = `chat-images/${ctx.user.id}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, "image/jpeg");

        // Create message with image
        const result = await createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: "image",
          mediaUrl: url,
          mediaType: "image/jpeg",
        });

        return {
          success: true,
          messageId: result[0].insertId,
          imageUrl: url,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send image",
        });
      }
    }),

  // Send audio message
  sendAudio: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        audioData: z.string(), // Base64 encoded audio
        duration: z.number(), // Duration in seconds
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Upload audio to S3
        const buffer = Buffer.from(input.audioData, "base64");
        const fileKey = `chat-audio/${ctx.user.id}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, "audio/mp3");

        // Create message with audio
        const result = await createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: "audio",
          mediaUrl: url,
          mediaType: "audio/mp3",
          mediaDuration: input.duration,
        });

        return {
          success: true,
          messageId: result[0].insertId,
          audioUrl: url,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send audio",
        });
      }
    }),

  // Mark message as read
  markAsRead: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await markMessageAsRead(input.messageId, ctx.user.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to mark message as read",
        });
      }
    }),

  // Delete message
  deleteMessage: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteMessage(input.messageId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete message",
        });
      }
    }),

  // Add reaction to message
  addReaction: protectedProcedure
    .input(
      z.object({
        messageId: z.number(),
        reaction: z.string(), // e.g., "👍", "❤️", "😂"
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await addMessageReaction(
          input.messageId,
          ctx.user.id,
          input.reaction
        );

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add reaction",
        });
      }
    }),
});

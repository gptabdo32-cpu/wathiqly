import { z } from "zod";

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_AUDIO_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg"];
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
    .query(async ({ ctx, input }) => {
      try {
        const conversation = await getConversation(input.conversationId);
        if (!conversation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        }
        if (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return conversation;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
    .query(async ({ ctx, input }) => {
      try {
        const conversation = await getConversation(input.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await getConversationMessages(
          input.conversationId,
          input.limit,
          input.offset
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
        const conversation = await getConversation(input.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
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
        if (error instanceof TRPCError) throw error;
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
        mimeType: z.string().refine(val => ALLOWED_IMAGE_MIME_TYPES.includes(val), { message: "Unsupported image MIME type" }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const conversation = await getConversation(input.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        // Upload image to S3
        const buffer = Buffer.from(input.imageData, "base64");
        const fileKey = `chat-images/${ctx.user.id}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        // Create message with image
        const result = await createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: "image",
          mediaUrl: url,
          mediaType: input.mimeType,
        });

        return {
          success: true,
          messageId: result[0].insertId,
          imageUrl: url,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
        mimeType: z.string().refine(val => ALLOWED_AUDIO_MIME_TYPES.includes(val), { message: "Unsupported audio MIME type" }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const conversation = await getConversation(input.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        // Upload audio to S3
        const buffer = Buffer.from(input.audioData, "base64");
        const fileKey = `chat-audio/${ctx.user.id}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        // Create message with audio
        const result = await createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          messageType: "audio",
          mediaUrl: url,
          mediaType: input.mimeType,
          mediaDuration: input.duration,
        });

        return {
          success: true,
          messageId: result[0].insertId,
          audioUrl: url,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
        const message = await getMessageById(input.messageId);
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        const conversation = await getConversation(message.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        await markMessageAsRead(input.messageId, ctx.user.id);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
        const message = await getMessageById(input.messageId);
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        // Only the sender can delete their message
        if (message.senderId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own messages" });
        }

        await deleteMessage(input.messageId);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
        const message = await getMessageById(input.messageId);
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        const conversation = await getConversation(message.conversationId);
        if (!conversation || (conversation.buyerId !== ctx.user.id && conversation.sellerId !== ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        await addMessageReaction(
          input.messageId,
          ctx.user.id,
          input.reaction
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add reaction",
        });
      }
    }),
});

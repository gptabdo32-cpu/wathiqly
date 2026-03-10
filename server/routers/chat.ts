import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_AUDIO_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg"];
const MAX_FILE_SIZE_MB = 10; // 10MB limit per file
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createConversation,
  getConversation,
  getUserConversations,
  createMessage,
  getConversationMessages,
  getMessageById,
  markMessageAsRead,
  deleteMessage,
  addMessageReaction,
  uploadAttachment,
  getEscrowById,
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
        // Security check: Verify escrow exists and user is a participant
        const escrow = await getEscrowById(input.escrowId);
        if (!escrow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Escrow transaction not found" });
        }
        if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this escrow" });
        }
        
        // Verify otherUserId is also a participant
        if (escrow.buyerId !== input.otherUserId && escrow.sellerId !== input.otherUserId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The other user is not a participant in this escrow" });
        }

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
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create conversation",
        });
      }
    }),

  // Get user conversations
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    try {
      const conversations = await getUserConversations(ctx.user.id);
      // Ensure only conversations where the user is buyer or seller are returned
      return conversations.filter(c => c.buyerId === ctx.user.id || c.sellerId === ctx.user.id);
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
        content: z.string().min(1).max(2000, "Message too long"),
        isEncrypted: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Simple rate limiting check (can be improved with Redis/Memory cache)
        const recentMessages = await getConversationMessages(input.conversationId, 5, 0);
        const userRecentMessages = recentMessages.filter(m => m.senderId === ctx.user.id);
        if (userRecentMessages.length >= 5) {
          const lastMessageTime = new Date(userRecentMessages[0].createdAt).getTime();
          if (Date.now() - lastMessageTime < 5000) { // 5 messages in 5 seconds
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Slow down! You're sending messages too fast." });
          }
        }

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

        // Validate file size
        const buffer = Buffer.from(input.imageData, "base64");
        if (buffer.length > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit`,
          });
        }

        // Validate file content
        const type = await fileTypeFromBuffer(buffer);
        if (!type || !ALLOWED_IMAGE_MIME_TYPES.includes(type.mime)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid image file content",
          });
        }

        // Upload image to S3
        const fileKey = `chat-images/${ctx.user.id}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, type.mime);

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

        // Validate file size
        const buffer = Buffer.from(input.audioData, "base64");
        if (buffer.length > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit`,
          });
        }

        // Validate file content
        const type = await fileTypeFromBuffer(buffer);
        if (!type || !ALLOWED_AUDIO_MIME_TYPES.includes(type.mime)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid audio file content",
          });
        }

        // Upload audio to S3
        const fileKey = `chat-audio/${ctx.user.id}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, type.mime);

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
    .input(z.object({ 
      messageId: z.number(),
      conversationId: z.number()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const message = await getMessageById(input.messageId);
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        }

        // Security check: Verify the message belongs to the specified conversation
        // This prevents cross-conversation message deletion via ID manipulation
        if (message.conversationId !== input.conversationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Message does not belong to this conversation" });
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
        reaction: z.string().min(1).max(10, "Reaction too long"), // e.g., "👍", "❤️", "😂"
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

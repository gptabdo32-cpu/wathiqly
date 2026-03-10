import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTimedLink,
  getTimedLinkByToken,
  getTimedLinkById,
  getSellerTimedLinks,
  useTimedLink,
  cancelTimedLink,
  markExpiredTimedLinks,
  getFeatureSettings,
} from "../db_new_features";
import { getUserById, createEscrow, getOrCreateWallet } from "../db";

export const timedLinksRouter = router({
  /**
   * Create a new timed link
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, "Title is required").max(255),
        description: z.string().optional(),
        amount: z
          .string()
          .refine(
            (val) =>
              !isNaN(parseFloat(val)) && parseFloat(val) > 0,
            { message: "Amount must be a positive number" }
          ),
        dealType: z
          .enum(["physical", "digital_account", "service"])
          .default("physical"),
        specifications: z.record(z.string(), z.any()).optional(),
        commissionPercentage: z
          .string()
          .refine(
            (val) =>
              !isNaN(parseFloat(val)) &&
              parseFloat(val) >= 0 &&
              parseFloat(val) <= 100,
            { message: "Commission percentage must be between 0 and 100" }
          )
          .default("2.5"),
        commissionPaidBy: z
          .enum(["buyer", "seller", "split"])
          .default("buyer"),
        expirationHours: z
          .number()
          .min(1)
          .max(168)
          .default(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is a seller
      if (ctx.user.userType !== "seller" && ctx.user.userType !== "both") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only sellers can create timed links",
        });
      }

      // Get feature settings to check if enabled
      const settings = await getFeatureSettings();
      if (!settings.timedLinksEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Timed links feature is currently disabled",
        });
      }

      // Validate expiration time
      const expirationSeconds = input.expirationHours * 3600;
      if (expirationSeconds > settings.timedLinksMaxExpiration) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Expiration time cannot exceed ${settings.timedLinksMaxExpiration / 3600} hours`,
        });
      }

      // Create expiration timestamp
      const expiresAt = new Date(
        Date.now() + expirationSeconds * 1000
      );

      // Create the timed link
      const result = await createTimedLink({
        createdBy: ctx.user.id,
        title: input.title,
        description: input.description,
        amount: input.amount,
        dealType: input.dealType,
        specifications: input.specifications,
        commissionPercentage: input.commissionPercentage,
        commissionPaidBy: input.commissionPaidBy,
        expiresAt,
      });

      return {
        success: true,
        linkId: result.linkId,
        linkToken: result.linkToken,
        shareUrl: `${process.env.CLIENT_URL || "http://localhost:5173"}/timed-link/${result.linkToken}`,
      };
    }),

  /**
   * Get a timed link by token (public)
   */
  getByToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const link = await getTimedLinkByToken(input.token);

      if (!link) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Timed link not found",
        });
      }

      // Check if link is still valid
      if (link.status === "expired") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This link has expired",
        });
      }

      if (link.status === "used") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This link has already been used",
        });
      }

      if (link.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This link has been cancelled",
        });
      }

      // Check expiration time
      if (new Date() > link.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This link has expired",
        });
      }

      // Security Check: If the link is used, only the seller or the buyer who used it can see details
      if (link.status === "used") {
        if (!ctx.user || (link.usedBy !== ctx.user.id && link.createdBy !== ctx.user.id)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view this used link",
          });
        }
      }

      // Get seller info
      const seller = await getUserById(link.createdBy);

      return {
        id: link.id,
        title: link.title,
        description: link.description,
        amount: link.amount,
        dealType: link.dealType,
        specifications: link.specifications,
        commissionPercentage: link.commissionPercentage,
        commissionPaidBy: link.commissionPaidBy,
        expiresAt: link.expiresAt,
        status: link.status,
        seller: {
          id: seller?.id,
          name: seller?.name,
          profileImage: seller?.profileImage,
          isTrustedSeller: seller?.isTrustedSeller,
        },
      };
    }),

  /**
   * Use a timed link to create an escrow
   */
  use: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get the link
      const link = await getTimedLinkByToken(input.token);

      if (!link) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Timed link not found",
        });
      }

      // Validate link status
      if (link.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot use this link. Status: ${link.status}`,
        });
      }

      // Check expiration
      if (new Date() > link.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This link has expired",
        });
      }

      // Prevent seller from using their own link
      if (link.createdBy === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot use your own timed link",
        });
      }

      // Verify seller exists
      const seller = await getUserById(link.createdBy);
      if (!seller) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Seller not found",
        });
      }

      // Create escrow from timed link
      const commissionAmount = (
        parseFloat(link.amount) *
        (parseFloat(link.commissionPercentage) / 100)
      ).toFixed(2);

      const escrowResult = await createEscrow({
        buyerId: ctx.user.id,
        sellerId: link.createdBy,
        title: link.title,
        description: link.description,
        amount: link.amount,
        commissionPercentage: link.commissionPercentage,
        commissionAmount,
        commissionPaidBy: link.commissionPaidBy,
        dealType: link.dealType,
        specifications: link.specifications,
        status: "draft",
      });

      const escrowId = escrowResult[0].insertId;

      // Mark link as used
      await useTimedLink(link.id, ctx.user.id, escrowId);

      return {
        success: true,
        escrowId,
        message: "Escrow created from timed link. Proceed to payment.",
      };
    }),

  /**
   * Get seller's timed links
   */
  getMyLinks: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check if user is a seller
      if (ctx.user.userType !== "seller" && ctx.user.userType !== "both") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only sellers can view their timed links",
        });
      }

      // Mark expired links
      await markExpiredTimedLinks();

      return await getSellerTimedLinks(
        ctx.user.id,
        input.limit,
        input.offset
      );
    }),

  /**
   * Cancel a timed link
   */
  cancel: protectedProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const link = await getTimedLinkById(input.linkId);

      if (!link) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Timed link not found",
        });
      }

      // Verify ownership
      if (link.createdBy !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only cancel your own links",
        });
      }

      // Check if link can be cancelled
      if (link.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel a ${link.status} link`,
        });
      }

      await cancelTimedLink(input.linkId);

      return { success: true, message: "Link cancelled successfully" };
    }),

  /**
   * Get link details (for seller management)
   */
  getDetails: protectedProcedure
    .input(z.object({ linkId: z.number() }))
    .query(async ({ ctx, input }) => {
      const link = await getTimedLinkById(input.linkId);

      if (!link) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Timed link not found",
        });
      }

      // Verify ownership
      if (link.createdBy !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view your own links",
        });
      }

      return link;
    }),
});

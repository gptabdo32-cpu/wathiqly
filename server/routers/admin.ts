import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getAdminStats,
  getAllDisputes,
  resolveDispute,
  getSuspiciousActivities,
  getUserById,
  getEscrowById,
  getAllUsers,
  updateUserKycStatus,
  updateUserStatus,
  getAllTransactions,
  updateEscrowStatus,
  createAdminLog,
  createNotification,
  sendGlobalNotification,
  getPlatformSettings,
  updatePlatformSettings,
  getAdminLogs,
  getAllDigitalProducts,
  updateDigitalProductStatus,
  getPlatformStats,
  db,
} from "../db";
import { users, adminLogs, escrows } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Admin Router - يوفر جميع العمليات الإدارية
 * يتطلب التحقق من دور المستخدم (Admin Role)
 */
export const adminRouter = router({
  /**
   * الحصول على إحصائيات لوحة التحكم
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    // التحقق من أن المستخدم مسؤول
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "ليس لديك صلاحيات كافية للوصول إلى هذا الموارد",
      });
    }

    try {
      const stats = await getAdminStats();
      return stats;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "فشل الحصول على الإحصائيات",
      });
    }
  }),

  /**
   * الحصول على قائمة جميع المستخدمين مع إمكانية البحث والتصفية
   */
  listUsers: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        kycStatus: z.enum(["all", "verified", "pending", "rejected"]).optional(),
        status: z.enum(["all", "active", "suspended"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        const result = await getAllUsers({
          search: input.search,
          kycStatus: input.kycStatus === "all" ? undefined : input.kycStatus,
          status: input.status === "all" ? undefined : input.status,
          limit: input.limit,
          offset: input.offset,
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على قائمة المستخدمين",
        });
      }
    }),

  /**
   * الموافقة على طلب KYC للمستخدم
   */
  approveKyc: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateUserKycStatus(input.userId, "verified");

        // تسجيل الإجراء في سجل المسؤولين
        await createAdminLog({
          adminId: ctx.user.id,
          action: "approve_kyc",
          targetUserId: input.userId,
          details: `تمت الموافقة على KYC للمستخدم ${input.userId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشلت الموافقة على KYC",
        });
      }
    }),

  /**
   * رفض طلب KYC للمستخدم
   */
  rejectKyc: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateUserKycStatus(input.userId, "rejected");

        await createAdminLog({
          adminId: ctx.user.id,
          action: "reject_kyc",
          targetUserId: input.userId,
          details: `تم رفض KYC للمستخدم ${input.userId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل رفض KYC",
        });
      }
    }),

  /**
   * تعليق حساب المستخدم
   */
  suspendUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateUserStatus(input.userId, "suspended");

        await createAdminLog({
          adminId: ctx.user.id,
          action: "suspend_user",
          targetUserId: input.userId,
          details: `تم تعليق حساب المستخدم ${input.userId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تعليق الحساب",
        });
      }
    }),

  /**
   * إعادة تفعيل حساب المستخدم
   */
  unsuspendUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateUserStatus(input.userId, "active");

        await createAdminLog({
          adminId: ctx.user.id,
          action: "unsuspend_user",
          targetUserId: input.userId,
          details: `تم إعادة تفعيل حساب المستخدم ${input.userId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشلت إعادة التفعيل",
        });
      }
    }),

  /**
   * الحصول على قائمة المعاملات مع إمكانية البحث والتصفية
   */
  listTransactions: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "pending", "completed", "cancelled"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        const result = await getAllTransactions({
          search: input.search,
          status: input.status === "all" ? undefined : input.status,
          limit: input.limit,
          offset: input.offset,
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على قائمة المعاملات",
        });
      }
    }),

  /**
   * تحرير الأموال في معاملة
   */
  releaseFunds: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateEscrowStatus(input.transactionId, "completed");

        await createAdminLog({
          adminId: ctx.user.id,
          action: "release_funds",
          targetEscrowId: input.transactionId,
          details: `تم تحرير الأموال للمعاملة ${input.transactionId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحرير الأموال",
        });
      }
    }),

  /**
   * استرجاع الأموال في معاملة
   */
  refundTransaction: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateEscrowStatus(input.transactionId, "cancelled");

        await createAdminLog({
          adminId: ctx.user.id,
          action: "refund_transaction",
          targetEscrowId: input.transactionId,
          details: `تم استرجاع الأموال للمعاملة ${input.transactionId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل استرجاع الأموال",
        });
      }
    }),

  /**
   * الحصول على قائمة النزاعات مع إمكانية البحث والتصفية
   */
  listDisputes: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "open", "in_review", "resolved"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        const disputes = await getAllDisputes({
          search: input.search,
          status: input.status === "all" ? undefined : input.status,
          limit: input.limit,
          offset: input.offset,
        });

        return disputes;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على قائمة النزاعات",
        });
      }
    }),

  /**
   * حل النزاع
   */
  resolveDispute: protectedProcedure
    .input(
      z.object({
        disputeId: z.number(),
        decision: z.enum(["buyer", "seller"]),
        resolution: z.string().min(10, "يجب أن يكون الحل على الأقل 10 أحرف"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await resolveDispute({
          disputeId: input.disputeId,
          decision: input.decision,
          resolution: input.resolution,
        });

        await createAdminLog({
          adminId: ctx.user.id,
          action: "resolve_dispute",
          targetDisputeId: input.disputeId,
          details: `تم حل النزاع ${input.disputeId} لصالح ${input.decision === "buyer" ? "المشتري" : "البائع"}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل حل النزاع",
        });
      }
    }),

  /**
   * الحصول على الأنشطة المشبوهة
   */
  getSuspiciousActivities: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "ليس لديك صلاحيات كافية",
      });
    }

    try {
      const suspicious = await getSuspiciousActivities();
      return suspicious;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "فشل الحصول على الأنشطة المشبوهة",
      });
    }
  }),

  /**
   * الحصول على تفاصيل مستخدم محدد
   */
  getUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        const user = await getUserById(input.userId);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المستخدم غير موجود",
          });
        }
        return user;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على تفاصيل المستخدم",
        });
      }
    }),

  /**
   * الحصول على تفاصيل معاملة محددة
   */
  getTransaction: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        const transaction = await getEscrowById(input.transactionId);
        if (!transaction) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المعاملة غير موجودة",
          });
        }
        return transaction;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على تفاصيل المعاملة",
        });
      }
    }),

  /**
   * إرسال تنبيه لمستخدم محدد
   */
  sendNotification: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.enum(["system", "marketing", "transaction", "dispute"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await createNotification({
          userId: input.userId,
          title: input.title,
          message: input.message,
          type: input.type as any,
        });

        await createAdminLog({
          adminId: ctx.user.id,
          action: "send_notification",
          targetUserId: input.userId,
          details: `تم إرسال تنبيه للمستخدم ${input.userId}: ${input.title}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال التنبيه",
        });
      }
    }),

  /**
   * إرسال تنبيه لجميع المستخدمين
   */
  sendGlobalNotification: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.enum(["system", "marketing"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await sendGlobalNotification(input.title, input.message, input.type);

        await createAdminLog({
          adminId: ctx.user.id,
          action: "send_global_notification",
          targetUserId: 0, // System-wide
          details: `تم إرسال تنبيه عام: ${input.title}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إرسال التنبيه العام",
        });
      }
    }),

  /**
   * الحصول على إعدادات المنصة
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "ليس لديك صلاحيات كافية",
      });
    }

    try {
      return await getPlatformSettings();
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "فشل الحصول على الإعدادات",
      });
    }
  }),

  /**
   * تحديث إعدادات المنصة
   */
  updateSettings: protectedProcedure
    .input(
      z.object({
        platformName: z.string().optional(),
        platformDescription: z.string().optional(),
        contactEmail: z.string().email().optional(),
        supportPhone: z.string().optional(),
        escrowCommissionPercentage: z.string().optional(),
        productCommissionPercentage: z.string().optional(),
        minWithdrawalAmount: z.string().optional(),
        isRegistrationEnabled: z.boolean().optional(),
        isEscrowEnabled: z.boolean().optional(),
        isProductMarketplaceEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updatePlatformSettings(input);

        await createAdminLog({
          adminId: ctx.user.id,
          action: "update_settings",
          targetUserId: 0,
          details: `تم تحديث إعدادات المنصة`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحديث الإعدادات",
        });
      }
    }),

  /**
   * الحصول على سجلات المسؤولين
   */
  listLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

        try {
        return await getAdminLogs(input.limit, input.offset);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على سجلات المسؤولين",
        });
      }
    }),

  /**
   * إدارة المنتجات الرقمية
   */
  listProducts: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        return await getAllDigitalProducts(input.search);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل الحصول على المنتجات",
        });
      }
    }),

  /**
   * تفعيل أو تعطيل منتج
   */
  toggleProductStatus: protectedProcedure
    .input(z.object({ productId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ليس لديك صلاحيات كافية",
        });
      }

      try {
        await updateDigitalProductStatus(input.productId, input.isActive);

        await createAdminLog({
          adminId: ctx.user.id,
          action: input.isActive ? "activate_product" : "deactivate_product",
          targetId: input.productId,
          targetType: "product",
          details: `تم ${input.isActive ? "تفعيل" : "تعطيل"} المنتج ${input.productId}`,
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل تحديث حالة المنتج",
        });
      }
    }),

  /**
   * إحصائيات العمولات والأرباح
   */
  getCommissionStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "ليس لديك صلاحيات كافية",
      });
    }

    try {
      return await getPlatformStats();
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "فشل الحصول على إحصائيات الأرباح",
      });
    }
  }),
});

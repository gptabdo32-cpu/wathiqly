import { router, protectedProcedure, adminProcedure } from "../core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createAdminLog, getAdminStats } from "../db";

/**
 * Admin Router - يوفر العمليات الإدارية الأساسية
 */
export const adminRouter = router({
  /**
   * الحصول على إحصائيات لوحة التحكم
   */
  getStats: adminProcedure.query(async ({ ctx }) => {
    const stats = await getAdminStats();
    
    // Log admin access to stats
    await createAdminLog({
      adminId: ctx.user.id,
      action: "view_stats",
      targetType: "system",
      targetId: 0,
      details: JSON.stringify({ timestamp: new Date() }),
    });

    return {
      totalUsers: stats.totalUsers,
      totalTransactions: stats.totalTransactions,
      totalVolume: stats.totalVolume,
      activeDisputes: stats.activeDisputes,
    };
  }),

  /**
   * الحصول على قائمة المستخدمين
   */
  listUsers: adminProcedure
    .input(z.object({ 
      limit: z.number().default(50), 
      offset: z.number().default(0),
      search: z.string().optional(),
      kycStatus: z.enum(["verified", "pending", "rejected"]).optional(),
    }))
    .query(async ({ input }) => {
      const { getAllUsers } = await import("../db-enhanced");
      return await getAllUsers(input);
    }),

  /**
   * الحصول على تفاصيل المستخدم
   */
  getUserDetails: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const { getUserById } = await import("../db");
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return user;
    }),

  /**
   * إيقاف المستخدم
   */
  suspendUser: adminProcedure
    .input(z.object({ userId: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Log the action
      await createAdminLog({
        adminId: ctx.user.id,
        action: "suspend_user",
        targetType: "user",
        targetId: input.userId,
        details: JSON.stringify({ reason: input.reason }),
      });
      return { success: true };
    }),

  /**
   * الحصول على قائمة المعاملات
   */
  listTransactions: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async () => {
      const { getAllTransactions } = await import("../db-enhanced");
      return await getAllTransactions();
    }),

  /**
   * الحصول على تفاصيل المعاملة
   */
  getTransactionDetails: adminProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input }) => {
      const { getEscrowById } = await import("../db");
      const escrow = await getEscrowById(input.transactionId);
      if (!escrow) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      return escrow;
    }),

  /**
   * الحصول على قائمة النزاعات
   */
  listDisputes: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async () => {
      const { getAllDisputes } = await import("../db-enhanced");
      return await getAllDisputes();
    }),

  /**
   * حل النزاع
   */
  resolveDispute: adminProcedure
    .input(z.object({
      disputeId: z.number(),
      resolution: z.string(),
      decision: z.enum(["buyer", "seller", "split"]),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { resolveDispute } = await import("../db");
        await resolveDispute(
          input.disputeId,
          ctx.user.id,
          input.decision,
          input.resolution
        );
        return { success: true };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to resolve dispute",
        });
      }
    }),

  /**
   * الحصول على سجلات الإدارة
   */
  getAdminLogs: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async () => {
      const { getAdminLogs } = await import("../db-enhanced");
      return await getAdminLogs();
    }),

  /**
   * التحقق من مستندات الهوية (KYC)
   */
  verifyKyc: adminProcedure
    .input(z.object({
      userId: z.number(),
      status: z.enum(["verified", "rejected"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { updateUserKycStatus, createNotification } = await import("../db-enhanced");
      
      await updateUserKycStatus(input.userId, input.status);
      
      // Notify user
      const title = input.status === "verified" ? "تم توثيق حسابك" : "فشل توثيق الحساب";
      const message = input.status === "verified" 
        ? "تهانينا! تم التحقق من هويتك بنجاح." 
        : `نعتذر، تم رفض مستنداتك. السبب: ${input.reason || "المستندات غير واضحة"}`;
        
      await createNotification(input.userId, "system", title, message, "/dashboard/kyc");

      // Log admin action
      const { createAdminLog } = await import("../db");
      await createAdminLog({
        adminId: ctx.user.id,
        action: "verify_kyc",
        targetType: "user",
        targetId: input.userId,
        details: JSON.stringify({ status: input.status, reason: input.reason }),
      });

      return { success: true };
    }),

  /**
   * إعدادات المنصة
   */
  getPlatformSettings: adminProcedure.query(async ({ ctx }) => {
    return {
      platformName: "وثّقلي",
      escrowCommissionPercentage: "2.5",
      productCommissionPercentage: "5.0",
      minWithdrawalAmount: "10.0",
    };
  }),

  /**
   * تحديث إعدادات المنصة
   */
  updatePlatformSettings: adminProcedure
    .input(z.object({
      escrowCommissionPercentage: z.string().optional(),
      productCommissionPercentage: z.string().optional(),
      minWithdrawalAmount: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Log the action
      await createAdminLog({
        adminId: ctx.user.id,
        action: "update_settings",
        targetType: "platform_settings",
        details: JSON.stringify(input),
      });
      return { success: true };
    }),
});

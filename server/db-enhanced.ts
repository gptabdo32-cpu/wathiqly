import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import {
  users,
  wallets,
  transactions,
  escrows,
  disputeMessages,
  disputeEvidence,
  notifications,
} from "../drizzle/schema";
import { encryptData, decryptData } from "./_core/encryption";
import { Decimal } from "decimal.js";
import { TRPCError } from "@trpc/server";

/**
 * Create a transaction record for financial operations
 * Ensures database transaction integrity for money movements
 */
export async function createFinancialTransaction(
  userId: number,
  type: "deposit" | "withdrawal" | "commission" | "refund" | "transfer",
  amount: string,
  referenceType: string,
  referenceId: number,
  description: string
) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.transaction(async (tx) => {
    // Create transaction record
    const result = await tx.insert(transactions).values({
      userId,
      type,
      amount,
      referenceType,
      referenceId,
      description,
      status: "completed",
    });

    return result;
  });
}

/**
 * Update wallet balance within a database transaction
 * Ensures atomic operations for wallet updates
 */
export async function updateWalletBalance(
  userId: number,
  amountChange: string,
  operation: "add" | "subtract"
) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.transaction(async (tx) => {
    // Get current wallet
    const wallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, userId),
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const currentBalance = new Decimal(wallet.balance);
    const change = new Decimal(amountChange);

    let newBalance = currentBalance;
    if (operation === "add") {
      newBalance = currentBalance.plus(change);
    } else if (operation === "subtract") {
      if (currentBalance.lt(change)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Insufficient balance",
        });
      }
      newBalance = currentBalance.minus(change);
    }

    const finalBalance = newBalance.toFixed(2);

    // Update wallet
    await tx.update(wallets).set({
      balance: finalBalance,
      updatedAt: new Date(),
    }).where(eq(wallets.id, wallet.id));

    return finalBalance;
  });
}

/**
 * Process escrow completion with atomic transaction
 * Ensures money transfer from buyer to seller is atomic
 */
export async function processEscrowCompletion(escrowId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.transaction(async (tx) => {
    // Get escrow details
    const escrow = await tx.query.escrows.findFirst({
      where: eq(escrows.id, escrowId),
    });

    if (!escrow) {
      throw new Error("Escrow not found");
    }

    if (escrow.status !== "delivered") {
      throw new Error("Escrow is not in delivered status");
    }

    // Deduct commission from buyer's wallet
    const buyerWallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, escrow.buyerId),
    });

    if (!buyerWallet) {
      throw new Error("Buyer wallet not found");
    }

    // Transfer amount to seller
    const sellerWallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, escrow.sellerId),
    });

    if (!sellerWallet) {
      throw new Error("Seller wallet not found");
    }

    const amount = new Decimal(escrow.amount);
    const commission = new Decimal(escrow.commissionAmount);
    const sellerAmount = amount.minus(commission);

    // Update seller wallet
    const currentSellerBalance = new Decimal(sellerWallet.balance);
    const currentTotalEarned = new Decimal(sellerWallet.totalEarned);
    
    await tx.update(wallets).set({
      balance: currentSellerBalance.plus(sellerAmount).toFixed(2),
      totalEarned: currentTotalEarned.plus(sellerAmount).toFixed(2),
      updatedAt: new Date(),
    }).where(eq(wallets.id, sellerWallet.id));

    // Update escrow status
    await tx.update(escrows).set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(escrows.id, escrowId));

    // Create transaction records
    await tx.insert(transactions).values({
      userId: escrow.sellerId,
      type: "deposit",
      amount: sellerAmount.toFixed(2),
      referenceType: "escrow",
      referenceId: escrowId,
      description: `Payment received for escrow: ${escrow.title}`,
      status: "completed",
    } as any);

    await tx.insert(transactions).values({
      userId: escrow.buyerId,
      type: "commission",
      amount: commission.toFixed(2),
      referenceType: "escrow",
      referenceId: escrowId,
      description: `Commission for escrow: ${escrow.title}`,
      status: "completed",
    } as any);

    return { success: true, sellerAmount: sellerAmount.toFixed(2) };
  });
}

/**
 * Add dispute message with encryption for sensitive content
 */
export async function addDisputeMessage(
  escrowId: number,
  senderId: number,
  message: string,
  shouldEncrypt: boolean = false
) {
  const messageContent = shouldEncrypt ? encryptData(message) : message;

  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.insert(disputeMessages).values({
    escrowId,
    senderId,
    message: messageContent,
  });
}

/**
 * Get dispute messages with decryption
 */
export async function getDisputeMessages(escrowId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); const messages = await db.query.disputeMessages.findMany({
    where: eq(disputeMessages.escrowId, escrowId),
  });

  return messages.map((msg) => ({
    ...msg,
    message: msg.message.includes(":") ? decryptData(msg.message) : msg.message,
  }));
}

/**
 * Upload dispute evidence
 */
export async function uploadDisputeEvidence(
  escrowId: number,
  uploaderId: number,
  fileUrl: string,
  fileType: string,
  description?: string
) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.insert(disputeEvidence).values({
    escrowId,
    uploaderId,
    fileUrl,
    fileType,
    description,
  });
}

/**
 * Create notification for user
 */
export async function createNotification(
  userId: number,
  type: "transaction" | "dispute" | "system" | "marketing",
  title: string,
  message: string,
  link?: string
) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.insert(notifications).values({
    userId,
    type,
    title,
    message,
    link,
  });
}

/**
 * Get unread notifications for user
 */
export async function getUnreadNotifications(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ),
  });
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available"); return await db.update(notifications).set({
    isRead: true,
  }).where(eq(notifications.id, notificationId));
}

// ============ ADMIN OPERATIONS ============

import { like, or, desc } from "drizzle-orm";
import { adminLogs, disputes } from "../drizzle/schema";

/**
 * الحصول على جميع المستخدمين مع إمكانية البحث والتصفية
 */
export async function getAllUsers(options?: {
  search?: string;
  kycStatus?: "verified" | "pending" | "rejected";
  status?: "active" | "suspended";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(users);

  // البحث عن الاسم أو البريد الإلكتروني
  if (options?.search) {
    query = query.where(
      or(
        like(users.name, `%${options.search}%`),
        like(users.email, `%${options.search}%`)
      )
    );
  }

  // تصفية حسب حالة KYC
  if (options?.kycStatus) {
    query = query.where(eq(users.kycStatus, options.kycStatus));
  }

  // تصفية حسب حالة الحساب
  if (options?.status) {
    query = query.where(eq(users.status, options.status));
  }

  // الترتيب والحد
  query = query
    .orderBy(desc(users.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  try {
    const result = await query;
    return result;
  } catch (error) {
    console.error("[Database] Failed to get users:", error);
    return [];
  }
}

/**
 * تحديث حالة KYC للمستخدم
 */
export async function updateUserKycStatus(
  userId: number,
  status: "verified" | "pending" | "rejected"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db
      .update(users)
      .set({
        kycStatus: status,
        identityVerifiedAt: status === "verified" ? new Date() : null,
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to update KYC status:", error);
    throw error;
  }
}

/**
 * تحديث حالة الحساب (نشط/معلق)
 */
export async function updateUserStatus(
  userId: number,
  status: "active" | "suspended"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db
      .update(users)
      .set({ status })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to update user status:", error);
    throw error;
  }
}

/**
 * الحصول على جميع المعاملات مع إمكانية البحث والتصفية
 */
export async function getAllTransactions(options?: {
  search?: string;
  status?: "pending" | "completed" | "cancelled";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(escrows);

  // البحث
  if (options?.search) {
    query = query.where(
      or(
        like(escrows.title, `%${options.search}%`),
        like(escrows.description, `%${options.search}%`)
      )
    );
  }

  // تصفية حسب الحالة
  if (options?.status) {
    query = query.where(eq(escrows.status, options.status));
  }

  query = query
    .orderBy(desc(escrows.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  try {
    const result = await query;
    return result;
  } catch (error) {
    console.error("[Database] Failed to get transactions:", error);
    return [];
  }
}

/**
 * تحديث حالة المعاملة (الوساطة)
 */
export async function updateEscrowStatus(
  escrowId: number,
  status: "pending" | "completed" | "cancelled"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db
      .update(escrows)
      .set({
        status,
        completedAt: status === "completed" ? new Date() : null,
      })
      .where(eq(escrows.id, escrowId));
  } catch (error) {
    console.error("[Database] Failed to update escrow status:", error);
    throw error;
  }
}

/**
 * الحصول على جميع النزاعات مع إمكانية البحث والتصفية
 */
export async function getAllDisputes(options?: {
  search?: string;
  status?: "open" | "in_review" | "resolved";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(disputes);

  // البحث
  if (options?.search) {
    query = query.where(
      or(
        like(disputes.reason, `%${options.search}%`),
        like(disputes.resolution, `%${options.search}%`)
      )
    );
  }

  // تصفية حسب الحالة
  if (options?.status) {
    query = query.where(eq(disputes.status, options.status));
  }

  query = query
    .orderBy(desc(disputes.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  try {
    const result = await query;
    return result;
  } catch (error) {
    console.error("[Database] Failed to get disputes:", error);
    return [];
  }
}

/**
 * حل النزاع
 */
export async function resolveDispute(options: {
  disputeId: number;
  decision: "buyer" | "seller";
  resolution: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db
      .update(disputes)
      .set({
        status: "resolved",
        resolution: options.resolution,
        resolvedAt: new Date(),
      })
      .where(eq(disputes.id, options.disputeId));
  } catch (error) {
    console.error("[Database] Failed to resolve dispute:", error);
    throw error;
  }
}

/**
 * إنشاء سجل إجراء إداري
 */
export async function createAdminLog(options: {
  adminId: number;
  action: string;
  targetUserId?: number;
  targetEscrowId?: number;
  targetDisputeId?: number;
  details: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create admin log: database not available");
    return;
  }

  try {
    await db.insert(adminLogs).values({
      adminId: options.adminId,
      action: options.action,
      targetUserId: options.targetUserId,
      targetEscrowId: options.targetEscrowId,
      targetDisputeId: options.targetDisputeId,
      details: options.details,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[Database] Failed to create admin log:", error);
  }
}

/**
 * الحصول على إحصائيات لوحة التحكم
 */
export async function getAdminStats() {
  const db = await getDb();
  if (!db) {
    return {
      totalUsers: 0,
      totalVolume: 0,
      activeDisputes: 0,
      totalTransactions: 0,
    };
  }

  try {
    // إجمالي المستخدمين
    const userCount = await db
      .select({ count: db.sql<number>`COUNT(*)` })
      .from(users);

    // إجمالي الأموال المحجوزة
    const volumeResult = await db
      .select({ total: db.sql<number>`SUM(amount)` })
      .from(escrows)
      .where(eq(escrows.status, "pending"));

    // النزاعات النشطة
    const disputeCount = await db
      .select({ count: db.sql<number>`COUNT(*)` })
      .from(disputes)
      .where(eq(disputes.status, "open"));

    // إجمالي المعاملات
    const transactionCount = await db
      .select({ count: db.sql<number>`COUNT(*)` })
      .from(escrows);

    return {
      totalUsers: userCount[0]?.count || 0,
      totalVolume: volumeResult[0]?.total || 0,
      activeDisputes: disputeCount[0]?.count || 0,
      totalTransactions: transactionCount[0]?.count || 0,
    };
  } catch (error) {
    console.error("[Database] Failed to get admin stats:", error);
    return {
      totalUsers: 0,
      totalVolume: 0,
      activeDisputes: 0,
      totalTransactions: 0,
    };
  }
}

/**
 * الحصول على الأنشطة المشبوهة
 */
export async function getSuspiciousActivities() {
  // هذه دالة تحتاج إلى تطبيق منطق كشف الأنشطة المشبوهة
  // يمكن توسيعها لاحقاً لتشمل كشف محاولات الاحتيال والهجمات
  return [];
}

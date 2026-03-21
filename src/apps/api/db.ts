import { eq, and, desc, gte, lte, or, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { Decimal } from "decimal.js";
import { TRPCError } from "@trpc/server";
import {
  InsertUser,
  users,
  wallets,
  InsertWallet,
  transactions,
  InsertTransaction,
  escrows,
  InsertEscrow,
  digitalProducts,
  InsertDigitalProduct,
  physicalProducts,
  vehicles,
  services,
  reviews,
  InsertReview,
  withdrawalRequests,
  InsertWithdrawalRequest,
  trustedSellerSubscriptions,
  InsertTrustedSellerSubscription,
  notifications,
  InsertNotification,
  platformSettings,
  InsertPlatformSettings,
  adminLogs,
  InsertAdminLog,
  chatConversations,
  InsertChatConversation,
  chatMessages,
  InsertChatMessage,
  chatMessageReactions,
  InsertChatMessageReaction,
  chatReadReceipts,
  InsertChatReadReceipt,
  chatAttachments,
  InsertChatAttachment,
  disputeMessages,
  disputeEvidence,
  disputes,
  auditLogs,
} from "../drizzle/schema";
import { ENV } from "./core/env";
import { createEncryptionManager } from "./core/security";

const encryptionManager = createEncryptionManager(ENV.encryptionKey!);

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function handleDbError(error: unknown, message: string): never {
  console.error(`[Database] ${message}:`, error);
  throw new Error("Database operation failed.");
}

// ============ USER OPERATIONS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phone", "bio", "city", "profileImage"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    handleDbError(error, "Failed to upsert user");
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(id: number, profile: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.update(users).set(profile).where(eq(users.id, id));
  } catch (error) {
    handleDbError(error, "Failed to update user profile");
  }
}

// ============ WALLET & FINANCIAL OPERATIONS ============

export async function getOrCreateWallet(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let wallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);

  if (wallet.length === 0) {
    await db.insert(wallets).values({
      userId,
      balance: "0",
      pendingBalance: "0",
      totalEarned: "0",
      totalWithdrawn: "0",
    });
    wallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  }

  return wallet[0];
}

export async function getWalletByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
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
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    // Get current wallet with FOR UPDATE lock to prevent race conditions
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1).for("update");

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

export async function createTransaction(transaction: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(transactions).values(transaction);
    return result;
  } catch (error) {
    handleDbError(error, "Failed to create transaction");
  }
}

export async function getUserTransactions(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============ ESCROW OPERATIONS ============

export async function createEscrow(escrow: InsertEscrow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(escrows).values(escrow);
    return result;
  } catch (error) {
    handleDbError(error, "Failed to create escrow");
  }
}

export async function getEscrowById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(escrows).where(eq(escrows.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserEscrows(userId: number, limit: number = 50, offset: number = 0, status?: string) {
  const db = await getDb();
  if (!db) return [];

  let conditions = or(
    eq(escrows.buyerId, userId),
    eq(escrows.sellerId, userId)
  );

  if (status) {
    conditions = and(conditions, eq(escrows.status, status as any));
  }

  return await db
    .select()
    .from(escrows)
    .where(conditions)
    .orderBy(desc(escrows.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateEscrowStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.update(escrows).set({ status: status as any }).where(eq(escrows.id, id));
  } catch (error) {
    handleDbError(error, "Failed to update escrow status");
  }
}

/**
 * Process escrow completion with atomic transaction
 * Ensures money transfer from buyer to seller is atomic
 */
export async function processEscrowCompletion(escrowId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    // Get escrow details with FOR UPDATE lock
    const [escrow] = await tx.select().from(escrows).where(eq(escrows.id, escrowId)).limit(1).for("update");

    if (!escrow) {
      throw new Error("Escrow not found");
    }

    if (escrow.status !== "delivered") {
      throw new Error("Escrow is not in delivered status");
    }

    // Get wallets with FOR UPDATE lock to prevent race conditions
    const [buyerWallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.buyerId)).limit(1).for("update");
    if (!buyerWallet) throw new Error("Buyer wallet not found");

    const [sellerWallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.sellerId)).limit(1).for("update");
    if (!sellerWallet) throw new Error("Seller wallet not found");

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

// ============ DISPUTE OPERATIONS ============

export async function resolveDispute(
  adminId: number,
  escrowId: number,
  decision: "buyer" | "seller" | "split",
  resolution: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    const [escrow] = await tx.select().from(escrows).where(eq(escrows.id, escrowId)).limit(1).for("update");
    if (!escrow) throw new Error("Escrow not found");

    const amount = new Decimal(escrow.amount);
    const commission = new Decimal(escrow.commissionAmount);

    if (decision === "buyer") {
      // Refund to buyer
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.buyerId)).limit(1).for("update");
      if (wallet) {
        await tx.update(wallets)
          .set({ balance: new Decimal(wallet.balance).plus(amount).toFixed(2) })
          .where(eq(wallets.id, wallet.id));
      }

      await tx.insert(transactions).values({
        userId: escrow.buyerId,
        type: "refund",
        amount: amount.toFixed(2),
        status: "completed",
        escrowId,
        description: `Dispute resolved in favor of buyer. Full refund issued.`,
      } as any);

    } else if (decision === "seller") {
      // Release to seller (amount - commission if seller paid it)
      const releaseAmount = escrow.commissionPaidBy === "seller" 
        ? amount.minus(commission).toFixed(2) 
        : amount.toFixed(2);

      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.sellerId)).limit(1).for("update");
      if (wallet) {
        await tx.update(wallets)
          .set({ 
            balance: new Decimal(wallet.balance).plus(releaseAmount).toFixed(2),
            totalEarned: new Decimal(wallet.totalEarned).plus(releaseAmount).toFixed(2)
          })
          .where(eq(wallets.id, wallet.id));
      }

      await tx.insert(transactions).values({
        userId: escrow.sellerId,
        type: "deposit",
        amount: releaseAmount,
        status: "completed",
        escrowId,
        description: `Dispute resolved in favor of seller. Funds released.`,
      } as any);

    } else if (decision === "split") {
      // Split 50/50
      const splitAmount = amount.div(2).toFixed(2);
      
      // Buyer part
      const [bWallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.buyerId)).limit(1).for("update");
      if (bWallet) {
        await tx.update(wallets)
          .set({ balance: new Decimal(bWallet.balance).plus(splitAmount).toFixed(2) })
          .where(eq(wallets.id, bWallet.id));
      }

      // Seller part
      const [sWallet] = await tx.select().from(wallets).where(eq(wallets.userId, escrow.sellerId)).limit(1).for("update");
      if (sWallet) {
        await tx.update(wallets)
          .set({ 
            balance: new Decimal(sWallet.balance).plus(splitAmount).toFixed(2),
            totalEarned: new Decimal(sWallet.totalEarned).plus(splitAmount).toFixed(2)
          })
          .where(eq(wallets.id, sWallet.id));
      }

      await tx.insert(transactions).values({
        userId: escrow.buyerId,
        type: "refund",
        amount: splitAmount,
        status: "completed",
        escrowId,
        description: `Dispute resolved with split decision. 50% refund issued.`,
      } as any);

      await tx.insert(transactions).values({
        userId: escrow.sellerId,
        type: "deposit",
        amount: splitAmount,
        status: "completed",
        escrowId,
        description: `Dispute resolved with split decision. 50% funds released.`,
      } as any);
    }

    // Update escrow status
    await tx.update(escrows)
      .set({ 
        status: "completed", 
        disputeResolution: resolution,
        disputeResolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(escrows.id, escrowId));

    // Log admin action
    await tx.insert(adminLogs).values({
      adminId,
      action: "resolve_dispute",
      targetType: "escrow",
      targetId: escrowId,
      details: JSON.stringify({ decision, resolution }),
    });

    return { success: true };
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
  const messageContent = shouldEncrypt ? encryptionManager.encrypt(message) : message;

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(disputeMessages).values({
    escrowId,
    senderId,
    message: messageContent,
  });
}

/**
 * Get dispute messages with decryption
 */
export async function getDisputeMessages(escrowId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const messages = await db.select().from(disputeMessages).where(eq(disputeMessages.escrowId, escrowId));

  return messages.map((msg) => ({
    ...msg,
    message: msg.message.includes(":") ? encryptionManager.decrypt(msg.message) : msg.message,
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
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(disputeEvidence).values({
    escrowId,
    uploaderId,
    fileUrl,
    fileType,
    description,
  });
}

// ============ PRODUCT OPERATIONS ============

export async function createDigitalProduct(product: InsertDigitalProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(digitalProducts).values(product);
    return result;
  } catch (error) {
    handleDbError(error, "Failed to create digital product");
  }
}

export async function getDigitalProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(digitalProducts).where(eq(digitalProducts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSellerProducts(sellerId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(digitalProducts)
    .where(and(eq(digitalProducts.sellerId, sellerId), eq(digitalProducts.isActive, true)))
    .orderBy(desc(digitalProducts.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function searchProducts(
  query: string,
  category?: string,
  type: "digital" | "physical" | "vehicle" | "service" = "digital",
  limit: number = 50,
  offset: number = 0,
  filters?: {
    minPrice?: string;
    maxPrice?: string;
    city?: string;
    condition?: "new" | "used";
    sortBy?: "newest" | "price-low" | "price-high" | "rating" | "popular";
  }
) {
  const db = await getDb();
  if (!db) return [];

  let table: any = digitalProducts;
  if (type === "physical") table = physicalProducts;
  else if (type === "vehicle") table = vehicles;
  else if (type === "service") table = services;

  let conditions = [eq(table.isActive, true)];

  if (category && category !== "all") {
    conditions.push(eq(table.category, category));
  }

  if (filters?.minPrice) {
    conditions.push(gte(table.price, filters.minPrice));
  }
  if (filters?.maxPrice) {
    conditions.push(lte(table.price, filters.maxPrice));
  }
  if (filters?.city) {
    conditions.push(eq(table.city, filters.city));
  }
  if (filters?.condition && type !== "service") {
    conditions.push(eq(table.condition, filters.condition));
  }

  let queryBuilder = db.select().from(table).where(and(...conditions));

  // Sorting
  if (filters?.sortBy === "price-low") {
    queryBuilder = queryBuilder.orderBy(table.price);
  } else if (filters?.sortBy === "price-high") {
    queryBuilder = queryBuilder.orderBy(desc(table.price));
  } else if (filters?.sortBy === "rating") {
    queryBuilder = queryBuilder.orderBy(desc(table.averageRating));
  } else if (filters?.sortBy === "popular" && type !== "vehicle" && type !== "service") {
    queryBuilder = queryBuilder.orderBy(desc(table.salesCount));
  } else {
    queryBuilder = queryBuilder.orderBy(desc(table.createdAt));
  }

  return await queryBuilder.limit(limit).offset(offset);
}

export async function getFeaturedProducts() {
  const db = await getDb();
  if (!db) return [];

  const digital = await db.select().from(digitalProducts).where(and(eq(digitalProducts.isActive, true), eq(digitalProducts.isFeatured, true))).limit(4);
  const physical = await db.select().from(physicalProducts).where(and(eq(physicalProducts.isActive, true), eq(physicalProducts.isFeatured, true))).limit(4);
  
  return { digital, physical };
}

// ============ TRUSTED SELLER SUBSCRIPTION ============

export async function createTrustedSellerSubscription(subscription: InsertTrustedSellerSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(trustedSellerSubscriptions).values(subscription);
  } catch (error) {
    handleDbError(error, "Failed to create trusted seller subscription");
  }
}

export async function getUserActiveTrustedSubscription(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(trustedSellerSubscriptions)
    .where(
      and(
        eq(trustedSellerSubscriptions.userId, userId),
        eq(trustedSellerSubscriptions.status, "active"),
        gte(trustedSellerSubscriptions.expiresAt, new Date())
      )
    )
    .orderBy(desc(trustedSellerSubscriptions.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ NOTIFICATION OPERATIONS ============

export async function createNotification(notification: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(notifications).values(notification);
  } catch (error) {
    handleDbError(error, "Failed to create notification");
  }
}

export async function getUserNotifications(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(notifications).where(
    and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    )
  );
}

export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(notifications).set({
    isRead: true,
  }).where(eq(notifications.id, notificationId));
}

// ============ PLATFORM SETTINGS ============

export async function getPlatformSettings() {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(platformSettings).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePlatformSettings(settings: InsertPlatformSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.insert(platformSettings).values(settings).onDuplicateKeyUpdate({ set: settings });
  } catch (error) {
    handleDbError(error, "Failed to update platform settings");
  }
}

// ============ ADMIN OPERATIONS ============

export async function createAdminLog(log: InsertAdminLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(adminLogs).values(log);
  } catch (error) {
    handleDbError(error, "Failed to create admin log");
  }
}

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

  if (options?.search) {
    query = query.where(
      or(
        like(users.name, `%${options.search}%`),
        like(users.email, `%${options.search}%`)
      )
    );
  }

  if (options?.kycStatus) {
    query = query.where(eq(users.kycStatus, options.kycStatus));
  }

  if (options?.status) {
    query = query.where(eq(users.status, options.status));
  }

  query = query
    .orderBy(desc(users.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  try {
    return await query;
  } catch (error) {
    console.error("[Database] Failed to get users:", error);
    return [];
  }
}

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
    const userCount = await db.select({ count: db.sql<number>`COUNT(*)` }).from(users);
    const volumeResult = await db.select({ total: db.sql<number>`SUM(amount)` }).from(escrows).where(eq(escrows.status, "pending"));
    const disputeCount = await db.select({ count: db.sql<number>`COUNT(*)` }).from(disputes).where(eq(disputes.status, "open"));
    const transactionCount = await db.select({ count: db.sql<number>`COUNT(*)` }).from(escrows);

    return {
      totalUsers: userCount[0]?.count || 0,
      totalVolume: volumeResult[0]?.total || 0,
      activeDisputes: disputeCount[0]?.count || 0,
      totalTransactions: transactionCount[0]?.count || 0,
    };
  } catch (error) {
    console.error("[Database] Failed to get admin stats:", error);
    return { totalUsers: 0, totalVolume: 0, activeDisputes: 0, totalTransactions: 0 };
  }
}

export async function getAllDisputes(options?: {
  status?: "open" | "resolved" | "closed";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(disputes);
  if (options?.status) {
    query = query.where(eq(disputes.status, options.status));
  }

  return await query
    .orderBy(desc(disputes.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}

export async function getAdminLogs(options?: {
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(adminLogs)
    .orderBy(desc(adminLogs.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}

export async function getAllTransactions(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(escrows);
  if (options?.status) {
    query = query.where(eq(escrows.status, options.status as any));
  }

  return await query
    .orderBy(desc(escrows.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}

export async function createAuditLog(log: {
  userId: number;
  action: string;
  entityType?: string;
  entityId?: number;
  oldValue?: object;
  newValue?: object;
  ipAddress?: string;
  userAgent?: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create audit log: database not available");
    return;
  }

  try {
    await db.insert(auditLogs).values({
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValue: log.oldValue ? JSON.stringify(log.oldValue) : null,
      newValue: log.newValue ? JSON.stringify(log.newValue) : null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[Database] Failed to create audit log:", error);
  }
}

// ============ CHAT OPERATIONS ============

export async function createConversation(conversation: InsertChatConversation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(chatConversations).values(conversation);
  } catch (error) {
    handleDbError(error, "Failed to create conversation");
  }
}

export async function getConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(chatConversations).where(eq(chatConversations.id, conversationId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(chatConversations)
    .where(or(eq(chatConversations.buyerId, userId), eq(chatConversations.sellerId, userId)))
    .orderBy(desc(chatConversations.updatedAt));
}

export async function createMessage(message: InsertChatMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(chatMessages).values(message);
  } catch (error) {
    handleDbError(error, "Failed to create message");
  }
}

export async function getConversationMessages(conversationId: number, limit: number, offset: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getMessageById(messageId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function markMessageAsRead(messageId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(chatReadReceipts).values({ messageId, userId, readAt: new Date() });
  } catch (error) {
    handleDbError(error, "Failed to mark message as read");
  }
}

export async function deleteMessage(messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.delete(chatMessages).where(eq(chatMessages.id, messageId));
  } catch (error) {
    handleDbError(error, "Failed to delete message");
  }
}

export async function addMessageReaction(messageId: number, userId: number, reaction: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(chatMessageReactions).values({ messageId, userId, reaction });
  } catch (error) {
    handleDbError(error, "Failed to add message reaction");
  }
}

export async function uploadAttachment(attachment: InsertChatAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db.insert(chatAttachments).values(attachment);
  } catch (error) {
    handleDbError(error, "Failed to upload attachment");
  }
}

export async function hasCompletedTransaction(user1Id: number, user2Id: number) {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(escrows)
    .where(
      and(
        or(
          and(eq(escrows.buyerId, user1Id), eq(escrows.sellerId, user2Id)),
          and(eq(escrows.buyerId, user2Id), eq(escrows.sellerId, user1Id))
        ),
        eq(escrows.status, "completed")
      )
    )
    .limit(1);

  return result.length > 0;
}

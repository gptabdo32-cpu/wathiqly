import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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
    console.error("[Database] Failed to upsert user:", error);
    throw error;
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

// ============ WALLET OPERATIONS ============

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

// ============ TRANSACTION OPERATIONS ============

export async function createTransaction(transaction: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(transactions).values(transaction);
  return result;
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

  const result = await db.insert(escrows).values(escrow);
  return result;
}

export async function getEscrowById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(escrows).where(eq(escrows.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserEscrows(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(escrows)
    .where(
      or(
        eq(escrows.buyerId, userId),
        eq(escrows.sellerId, userId)
      )
    )
    .orderBy(desc(escrows.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateEscrowStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(escrows).set({ status: status as any }).where(eq(escrows.id, id));
}

// ============ DIGITAL PRODUCT OPERATIONS ============

export async function createDigitalProduct(product: InsertDigitalProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(digitalProducts).values(product);
  return result;
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
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return [];

  let conditions = [eq(digitalProducts.isActive, true)];

  if (category) {
    conditions.push(eq(digitalProducts.category, category));
  }

  return await db
    .select()
    .from(digitalProducts)
    .where(and(...conditions))
    .orderBy(desc(digitalProducts.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============ REVIEW OPERATIONS ============

export async function createReview(review: InsertReview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(reviews).values(review);
}

export async function getUserReviews(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(reviews)
    .where(eq(reviews.revieweeId, userId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============ WITHDRAWAL OPERATIONS ============

export async function createWithdrawalRequest(request: InsertWithdrawalRequest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(withdrawalRequests).values(request);
}

export async function getUserWithdrawals(userId: number, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.userId, userId))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getPendingWithdrawals(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.status, "pending"))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============ ADMIN OPERATIONS ============

export async function getAdminStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get total escrow volume (funded, delivered, completed, disputed)
  const allEscrows = await db.select().from(escrows);
  const totalVolume = allEscrows
    .filter(e => ["funded", "delivered", "completed", "disputed"].includes(e.status))
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  const activeDisputes = allEscrows.filter(e => e.status === "disputed").length;
  
  const totalUsers = (await db.select().from(users)).length;
  
  return {
    totalVolume: totalVolume.toFixed(2),
    activeDisputes,
    totalUsers,
    totalTransactions: allEscrows.length
  };
}

export async function getAllDisputes(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(escrows)
    .where(eq(escrows.status, "disputed"))
    .orderBy(desc(escrows.disputeRaisedAt))
    .limit(limit)
    .offset(offset);
}

export async function resolveDispute(escrowId: number, resolution: string, status: "completed" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(escrows)
    .set({ 
      status, 
      disputeResolution: resolution,
      disputeResolvedAt: new Date()
    })
    .where(eq(escrows.id, escrowId));
}

export async function getSuspiciousActivities() {
  const db = await getDb();
  if (!db) return [];

  // Simple heuristic: users who created many escrows in a short time
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  
  const recentEscrows = await db.select().from(escrows).where(gte(escrows.createdAt, oneMinuteAgo));
  
  const userCounts: Record<number, number> = {};
  recentEscrows.forEach(e => {
    userCounts[e.buyerId] = (userCounts[e.buyerId] || 0) + 1;
  });

  const suspiciousUsers = Object.entries(userCounts)
    .filter(([_, count]) => count >= 5) // Threshold: 5+ requests per minute
    .map(([userId, count]) => ({
      userId: parseInt(userId),
      count,
      reason: "High frequency of escrow creation (5+ per minute)"
    }));

  return suspiciousUsers;
}

// ============ TRUSTED SELLER OPERATIONS ============

export async function createTrustedSellerSubscription(subscription: InsertTrustedSellerSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(trustedSellerSubscriptions).values(subscription);
}

export async function getUserActiveTrustedSubscription(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(trustedSellerSubscriptions)
    .where(and(eq(trustedSellerSubscriptions.userId, userId), eq(trustedSellerSubscriptions.isActive, true)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ NOTIFICATION OPERATIONS ============

export async function createNotification(notification: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(notifications).values(notification);
}

export async function getUserNotifications(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function sendGlobalNotification(title: string, message: string, type: "system" | "marketing") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allUsers = await db.select({ id: users.id }).from(users);
  
  const notificationValues = allUsers.map(u => ({
    userId: u.id,
    title,
    message,
    type,
    isRead: false
  }));

  // Insert in chunks to avoid large query issues
  const chunkSize = 100;
  for (let i = 0; i < notificationValues.length; i += chunkSize) {
    const chunk = notificationValues.slice(i, i + chunkSize);
    await db.insert(notifications).values(chunk);
  }
}

// ============ PLATFORM SETTINGS OPERATIONS ============

export async function getPlatformSettings() {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(platformSettings).limit(1);
  
  if (result.length === 0) {
    // Create default settings if not exists
    await db.insert(platformSettings).values({
      platformName: "وثّقلي",
      escrowCommissionPercentage: "2.5",
      productCommissionPercentage: "5.0",
      minWithdrawalAmount: "10.0",
    });
    const newResult = await db.select().from(platformSettings).limit(1);
    return newResult[0];
  }
  
  return result[0];
}

export async function updatePlatformSettings(settings: Partial<InsertPlatformSettings>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const currentSettings = await getPlatformSettings();
  if (!currentSettings) throw new Error("Could not initialize settings");

  await db.update(platformSettings)
    .set(settings)
    .where(eq(platformSettings.id, currentSettings.id));
}

// ============ ADMIN LOG OPERATIONS ============

export async function getAdminLogs(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(adminLogs)
    .orderBy(desc(adminLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function createAdminLog(log: InsertAdminLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(adminLogs).values(log);
}

// Helper function to import or
import { or } from "drizzle-orm";

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

/**
 * getDb (Rule 15: Prevent silent failures)
 * MISSION: Ensure database connection is reliable or fails loudly.
 */
export async function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.error("[Database] CRITICAL: Failed to connect:", error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return _db;
}

function handleDbError(error: unknown, message: string): never {
  console.error(`[Database] ${message}:`, error);
  throw new Error(`Database operation failed: ${message}`);
}

// ============ USER OPERATIONS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();

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
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(id: number, profile: Partial<InsertUser>) {
  const db = await getDb();
  try {
    await db.update(users).set(profile).where(eq(users.id, id));
  } catch (error) {
    handleDbError(error, "Failed to update user profile");
  }
}

// ... (rest of the file remains same but with getDb() throwing instead of returning null)

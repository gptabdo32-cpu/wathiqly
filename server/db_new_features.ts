import { eq, and, desc, lte, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  timedLinks,
  InsertTimedLink,
  disputeCollaterals,
  InsertDisputeCollateral,
  disputeCollateralWallets,
  InsertDisputeCollateralWallet,
  featureSettings,
  InsertFeatureSettings,
  inspectionReports,
  InsertInspectionReport,
  inspectionAgents,
  InsertInspectionAgent,
} from "../drizzle/schema_new_features";
import { ENV } from "./_core/env";
import { v4 as uuidv4 } from "uuid";

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

// ============ TIMED LINKS OPERATIONS ============

/**
 * Create a new timed link for a seller
 */
export async function createTimedLink(link: InsertTimedLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generate unique token
  const linkToken = uuidv4();

  const result = await db.insert(timedLinks).values({
    ...link,
    linkToken,
  });

  return { success: true, linkToken, linkId: result[0].insertId };
}

/**
 * Get a timed link by token
 */
export async function getTimedLinkByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(timedLinks)
    .where(eq(timedLinks.linkToken, token))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get a timed link by ID
 */
export async function getTimedLinkById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(timedLinks)
    .where(eq(timedLinks.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all timed links created by a seller
 */
export async function getSellerTimedLinks(
  sellerId: number,
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(timedLinks)
    .where(eq(timedLinks.createdBy, sellerId))
    .orderBy(desc(timedLinks.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Use a timed link (mark as used and create escrow)
 */
export async function useTimedLink(
  linkId: number,
  buyerId: number,
  escrowId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(timedLinks)
    .set({
      isUsed: true,
      usedBy: buyerId,
      usedAt: new Date(),
      status: "used",
      escrowId,
    })
    .where(eq(timedLinks.id, linkId));

  return { success: true };
}

/**
 * Cancel a timed link
 */
export async function cancelTimedLink(linkId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(timedLinks)
    .set({ status: "cancelled" })
    .where(eq(timedLinks.id, linkId));

  return { success: true };
}

/**
 * Mark expired timed links as expired (should be called periodically)
 */
export async function markExpiredTimedLinks() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  await db
    .update(timedLinks)
    .set({ status: "expired" })
    .where(
      and(
        lte(timedLinks.expiresAt, now),
        eq(timedLinks.status, "active")
      )
    );

  return { success: true };
}

// ============ DISPUTE COLLATERAL OPERATIONS ============

/**
 * Get or create a dispute collateral wallet for a user
 */
export async function getOrCreateDisputeCollateralWallet(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let wallet = await db
    .select()
    .from(disputeCollateralWallets)
    .where(eq(disputeCollateralWallets.userId, userId))
    .limit(1);

  if (wallet.length === 0) {
    await db.insert(disputeCollateralWallets).values({
      userId,
      availableBalance: "0",
      heldBalance: "0",
      totalForfeited: "0",
      totalRefunded: "0",
    });
    wallet = await db
      .select()
      .from(disputeCollateralWallets)
      .where(eq(disputeCollateralWallets.userId, userId))
      .limit(1);
  }

  return wallet[0];
}

/**
 * Create a dispute collateral record
 */
export async function createDisputeCollateral(
  collateral: InsertDisputeCollateral
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(disputeCollaterals).values(collateral);
  return result;
}

/**
 * Get dispute collateral by escrow ID
 */
export async function getDisputeCollateralByEscrowId(escrowId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(disputeCollaterals)
    .where(eq(disputeCollaterals.escrowId, escrowId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Update dispute collateral status
 */
export async function updateDisputeCollateralStatus(
  collateralId: number,
  status: string,
  resolvedBy?: number,
  reason?: string,
  foreitedTo?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    status,
    resolvedAt: new Date(),
  };

  if (resolvedBy) updateData.resolvedBy = resolvedBy;
  if (reason) updateData.reason = reason;
  if (foreitedTo) updateData.foreitedTo = foreitedTo;

  await db
    .update(disputeCollaterals)
    .set(updateData)
    .where(eq(disputeCollaterals.id, collateralId));

  return { success: true };
}

/**
 * Get all active collaterals for a user (held in disputes)
 */
export async function getUserActiveCollaterals(
  userId: number,
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(disputeCollaterals)
    .where(
      and(
        eq(disputeCollaterals.paidBy, userId),
        eq(disputeCollaterals.status, "held")
      )
    )
    .orderBy(desc(disputeCollaterals.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Update dispute collateral wallet balance
 */
export async function updateDisputeCollateralWallet(
  userId: number,
  availableBalance?: string,
  heldBalance?: string,
  totalForfeited?: string,
  totalRefunded?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {};

  if (availableBalance !== undefined)
    updateData.availableBalance = availableBalance;
  if (heldBalance !== undefined) updateData.heldBalance = heldBalance;
  if (totalForfeited !== undefined) updateData.totalForfeited = totalForfeited;
  if (totalRefunded !== undefined) updateData.totalRefunded = totalRefunded;

  await db
    .update(disputeCollateralWallets)
    .set(updateData)
    .where(eq(disputeCollateralWallets.userId, userId));

  return { success: true };
}

// ============ FEATURE SETTINGS OPERATIONS ============

/**
 * Get feature settings (or create default if not exists)
 */
export async function getFeatureSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let settings = await db.select().from(featureSettings).limit(1);

  if (settings.length === 0) {
    // Create default settings
    await db.insert(featureSettings).values({
      timedLinksEnabled: true,
      timedLinksDefaultExpiration: 7200, // 2 hours
      timedLinksMaxExpiration: 604800, // 7 days
      disputeCollateralEnabled: true,
      disputeCollateralAmount: "5.0",
      disputeCollateralPercentage: "0",
      disputeCollateralForfeitedTo: "platform",
      inspectionServiceEnabled: true,
      inspectionDefaultFee: "20.0",
    });

    settings = await db.select().from(featureSettings).limit(1);
  }

  return settings[0];
}

/**
 * Update feature settings
 */
export async function updateFeatureSettings(
  updates: Partial<InsertFeatureSettings>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get or create settings first
  const settings = await getFeatureSettings();

  await db
    .update(featureSettings)
    .set(updates)
    .where(eq(featureSettings.id, settings.id));

  return { success: true };
}

// ============ INSPECTION SERVICE OPERATIONS ============

/**
 * Create a new inspection report
 */
export async function createInspectionReport(report: InsertInspectionReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(inspectionReports).values(report);
  return result;
}

/**
 * Get inspection report by ID
 */
export async function getInspectionReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(inspectionReports)
    .where(eq(inspectionReports.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get inspection report by escrow ID
 */
export async function getInspectionReportByEscrowId(escrowId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(inspectionReports)
    .where(eq(inspectionReports.escrowId, escrowId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Update inspection report status
 */
export async function updateInspectionReportStatus(
  reportId: number,
  status: string,
  isVerified: boolean = false
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { status };
  if (isVerified) {
    updateData.isVerified = true;
    updateData.verifiedAt = new Date();
  }

  await db
    .update(inspectionReports)
    .set(updateData)
    .where(eq(inspectionReports.id, reportId));

  return { success: true };
}

/**
 * Get all inspection agents
 */
export async function getAllInspectionAgents() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(inspectionAgents)
    .where(eq(inspectionAgents.isAvailable, true));
}

/**
 * Get inspection agent by user ID
 */
export async function getInspectionAgentByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(inspectionAgents)
    .where(eq(inspectionAgents.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

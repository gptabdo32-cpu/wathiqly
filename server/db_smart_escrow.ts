import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  escrowMilestones,
  InsertEscrowMilestone,
  iotDevices,
  InsertIotDevice,
  blockchainLogs,
  InsertBlockchainLog,
} from "../drizzle/schema_smart_escrow";
import { escrows } from "../drizzle/schema";

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

// ============ MILESTONES OPERATIONS ============

/**
 * Create multiple milestones for an escrow
 */
export async function createMilestones(milestones: InsertEscrowMilestone[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(escrowMilestones).values(milestones);
  return result;
}

/**
 * Get milestones for an escrow
 */
export async function getEscrowMilestones(escrowId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(escrowMilestones)
    .where(eq(escrowMilestones.escrowId, escrowId))
    .orderBy(escrowMilestones.id);
}

/**
 * Update milestone status
 */
export async function updateMilestoneStatus(
  milestoneId: number,
  status: "pending" | "in_progress" | "completed" | "released" | "disputed",
  verificationData?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { status };
  if (status === "completed") updateData.completedAt = new Date();
  if (status === "released") updateData.releasedAt = new Date();
  if (verificationData) updateData.verificationData = verificationData;

  await db
    .update(escrowMilestones)
    .set(updateData)
    .where(eq(escrowMilestones.id, milestoneId));

  return { success: true };
}

// ============ IOT DEVICES OPERATIONS ============

/**
 * Register an IoT device for an escrow
 */
export async function registerIotDevice(device: InsertIotDevice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(iotDevices).values(device);
  return result;
}

/**
 * Get IoT devices for an escrow
 */
export async function getEscrowIotDevices(escrowId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(iotDevices)
    .where(eq(iotDevices.escrowId, escrowId));
}

/**
 * Update IoT device reading
 */
export async function updateIotReading(
  deviceId: string,
  reading: any,
  status?: "active" | "inactive" | "triggered" | "tampered"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { lastReading: reading };
  if (status) updateData.status = status;

  await db
    .update(iotDevices)
    .set(updateData)
    .where(eq(iotDevices.deviceId, deviceId));

  return { success: true };
}

// ============ BLOCKCHAIN LOGS OPERATIONS ============

/**
 * Log a blockchain transaction
 */
export async function logBlockchainTx(log: InsertBlockchainLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(blockchainLogs).values(log);
  return result;
}

/**
 * Get blockchain logs for an escrow
 */
export async function getEscrowBlockchainLogs(escrowId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(blockchainLogs)
    .where(eq(blockchainLogs.escrowId, escrowId))
    .orderBy(desc(blockchainLogs.createdAt));
}

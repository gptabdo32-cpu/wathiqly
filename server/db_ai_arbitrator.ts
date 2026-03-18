import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  aiArbitratorAnalysis,
  InsertAiArbitratorAnalysis,
} from "../drizzle/schema_ai_arbitrator";

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

/**
 * Create a new AI Arbitrator analysis record
 */
export async function createAiArbitratorAnalysis(analysis: InsertAiArbitratorAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(aiArbitratorAnalysis).values(analysis);
  return result;
}

/**
 * Get the latest AI Arbitrator analysis for a given escrowId
 */
export async function getLatestAiArbitratorAnalysis(escrowId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(aiArbitratorAnalysis)
    .where(eq(aiArbitratorAnalysis.escrowId, escrowId))
    .orderBy(desc(aiArbitratorAnalysis.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

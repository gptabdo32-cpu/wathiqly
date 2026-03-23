import { eq } from "drizzle-orm";
import { IEscrowRepository, OutboxEventInput } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { escrows, disputes, escrowMilestones, aiArbitratorAnalyses } from "../../../infrastructure/db/schema";
import { outboxEvents } from "../../../infrastructure/db/schema_outbox";
import { getDb } from "../../../infrastructure/db";
import { EscrowMapper } from "./EscrowMapper";
import { TransactionManager, DbTransaction } from "../../../core/db/TransactionManager";
import { Logger } from "../../../core/observability/Logger";

/**
 * DrizzleEscrowRepository (Rule 11: Outbox Hardening)
 * MISSION: Ensure reliable event persistence and domain state updates.
 */
export class DrizzleEscrowRepository implements IEscrowRepository {
  async create(escrow: Escrow, correlationId: string, tx?: DbTransaction): Promise<number> {
    const persistence = EscrowMapper.toPersistence(escrow);
    
    const operation = async (dbTx: DbTransaction) => {
      const [result] = await dbTx.insert(escrows).values({
        buyerId: persistence.buyerId,
        sellerId: persistence.sellerId,
        amount: persistence.amount,
        status: persistence.status as "pending" | "locked" | "released" | "refunded" | "disputed",
        title: persistence.description.substring(0, 255),
        description: persistence.description,
        commissionAmount: "0.00",
      });
      return result.insertId;
    };

    if (tx) return operation(tx);
    return await TransactionManager.run(operation, correlationId);
  }

  async getById(id: number, tx?: DbTransaction): Promise<Escrow | null> {
    const db = tx || (await getDb());
    const [row] = await db
      .select()
      .from(escrows)
      .where(eq(escrows.id, id))
      .limit(1);
    
    if (!row) return null;
    
    return EscrowMapper.toDomain(row);
  }

  async update(escrow: Escrow, tx?: DbTransaction): Promise<void> {
    const db = tx || (await getDb());
    const persistence = EscrowMapper.toPersistence(escrow);
    if (!persistence.id) throw new Error("Cannot update escrow without ID");
    
    await db
      .update(escrows)
      .set({
        status: persistence.status as "pending" | "locked" | "released" | "refunded" | "disputed",
      })
      .where(eq(escrows.id, persistence.id));
  }

  async createDispute(data: {
    escrowId: number;
    initiatorId: number;
    reason: string;
    status: string;
  }, tx?: DbTransaction): Promise<number> {
    const db = tx || (await getDb());
    const [dispute] = await db.insert(disputes).values({
        escrowId: data.escrowId,
        initiatorId: data.initiatorId,
        reason: data.reason,
        status: data.status as "open" | "resolved" | "rejected"
    });
    return dispute.insertId;
  }

  async getDisputeById(id: number, tx?: DbTransaction): Promise<unknown> {
    const db = tx || (await getDb());
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, id))
      .limit(1);
    return dispute;
  }

  async updateDispute(id: number, data: Record<string, unknown>, tx?: DbTransaction): Promise<void> {
    const db = tx || (await getDb());
    await db
      .update(disputes)
      .set(data as any) // Internal Drizzle cast for generic update
      .where(eq(disputes.id, id));
  }

  async saveMilestones(escrowId: number, milestones: any[], tx?: DbTransaction): Promise<void> {
    const db = tx || (await getDb());
    const values = milestones.map(m => ({
      ...m,
      escrowId,
      status: "pending"
    }));
    await db.insert(escrowMilestones).values(values);
  }

  async saveAiAnalysis(escrowId: number, analysis: any, tx?: DbTransaction): Promise<{ id: number }> {
    const db = tx || (await getDb());
    const [result] = await db.insert(aiArbitratorAnalyses).values({
      escrowId,
      fairnessScore: analysis.fairnessScore,
      legalRiskLevel: analysis.legalRiskLevel,
      analysisResults: analysis,
      summary: analysis.summary,
      status: "completed"
    });
    return { id: result.insertId };
  }

  /**
   * Rule 11: Outbox Hardening
   * MISSION: Guarantee at-least-once delivery with retry tracking.
   */
  async saveOutboxEvent(event: OutboxEventInput, tx?: DbTransaction): Promise<void> {
    const db = tx || (await getDb());
    
    Logger.info(`[Outbox][CID:${event.correlationId}] Saving event: ${event.eventType} (${event.eventId})`);

    try {
      await db.insert(outboxEvents).values({
        eventId: event.eventId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId.toString(),
        eventType: event.eventType,
        version: event.version,
        payload: event.payload,
        correlationId: event.correlationId,
        idempotencyKey: event.idempotencyKey,
        status: "pending",
        retries: 0, // Rule 11: Initialize retries
        createdAt: new Date(),
      });
    } catch (error: any) {
      // Rule 7: Idempotency (End-to-End)
      if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate entry')) {
        Logger.warn(`[Outbox] Duplicate event detected: ${event.eventId}. Skipping.`);
        return;
      }
      throw error;
    }
  }
}

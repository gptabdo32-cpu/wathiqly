import { eq } from "drizzle-orm";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { escrows, disputes, escrowSagaInstances } from "../../../infrastructure/db/schema";
import { outboxEvents } from "../../../infrastructure/db/schema_outbox";
import { getDb } from "../../../apps/api/db";
import { EscrowMapper } from "./EscrowMapper";
import { TransactionManager } from "../../../core/db/TransactionManager";

export class DrizzleEscrowRepository implements IEscrowRepository {
  async create(escrow: Escrow, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const persistence = EscrowMapper.toPersistence(escrow);
    
    // Use TransactionManager internally if no tx provided to ensure ACID (Task 1)
    const operation = async (dbTx: any) => {
      const [result] = await dbTx.insert(escrows).values({
        buyerId: persistence.buyerId,
        sellerId: persistence.sellerId,
        amount: persistence.amount,
        status: persistence.status as any,
        title: persistence.description.substring(0, 255),
        description: persistence.description,
        commissionAmount: "0.00", // Default for now
      });
      return result.insertId;
    };

    if (tx) return operation(tx);
    return await TransactionManager.run(operation);
  }

  async getById(id: number, tx?: any): Promise<Escrow | null> {
    const db = tx || (await getDb());
    const [row] = await db
      .select()
      .from(escrows)
      .where(eq(escrows.id, id))
      .limit(1);
    
    if (!row) return null;
    
    return EscrowMapper.toDomain(row);
  }

  async update(escrow: Escrow, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    const persistence = EscrowMapper.toPersistence(escrow);
    if (!persistence.id) throw new Error("Cannot update escrow without ID");
    
    await db
      .update(escrows)
      .set({
        status: persistence.status as any,
      })
      .where(eq(escrows.id, persistence.id));
  }

  async createDispute(data: any, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const [dispute] = await db.insert(disputes).values(data);
    return dispute.insertId;
  }

  async getDisputeById(id: number, tx?: any): Promise<any> {
    const db = tx || (await getDb());
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, id))
      .limit(1);
    return dispute;
  }

  async updateDispute(id: number, data: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db
      .update(disputes)
      .set(data)
      .where(eq(disputes.id, id));
  }

  async saveOutboxEvent(event: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(outboxEvents).values(event);
  }

  async updateEscrowBlockchainStatus(escrowId: number, blockchainStatus: any, lastTxHash: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    // In the new schema, we might need to add these fields or use a separate table
    // For now, keeping it compatible with the interface
  }

  async updateDisputeBlockchainStatus(disputeId: number, blockchainTxHash: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.update(disputes)
      .set({ updatedAt: new Date() }) // Placeholder
      .where(eq(disputes.id, disputeId));
  }

  // Saga Instance Methods (Task 3)
  async createSagaInstance(instance: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(escrowSagaInstances).values(instance);
  }

  async getSagaInstanceByCorrelationId(correlationId: string, tx?: any): Promise<any> {
    const db = tx || (await getDb());
    const [row] = await db
      .select()
      .from(escrowSagaInstances)
      .where(eq(escrowSagaInstances.correlationId, correlationId))
      .limit(1);
    return row;
  }

  async updateSagaStatus(correlationId: string, status: any, error?: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db
      .update(escrowSagaInstances)
      .set({ status, error, updatedAt: new Date() })
      .where(eq(escrowSagaInstances.correlationId, correlationId));
  }
}

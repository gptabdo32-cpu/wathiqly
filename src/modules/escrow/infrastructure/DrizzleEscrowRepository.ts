import { eq } from "drizzle-orm";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { Dispute } from "../domain/Dispute";
import { escrowContracts, disputes } from "../../../drizzle/schema_escrow_engine";
import { outboxEvents } from "../../../drizzle/schema_outbox";
import { getDb } from "../../../apps/api/db";

export class DrizzleEscrowRepository implements IEscrowRepository {
  async create(data: Omit<Escrow, 'id'>, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const [contract] = await db.insert(escrowContracts).values(data);
    return contract.insertId;
  }

  async getById(id: number, tx?: any): Promise<Escrow | undefined> {
    const db = tx || (await getDb());
    const [escrow] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, id))
      .limit(1);
    return escrow as Escrow | undefined;
  }

  async updateStatus(id: number, status: Escrow["status"], tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db
      .update(escrowContracts)
      .set({ status })
      .where(eq(escrowContracts.id, id));
  }

  async createDispute(data: Omit<Dispute, 'id'>, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const [dispute] = await db.insert(disputes).values(data);
    return dispute.insertId;
  }

  async getDisputeById(id: number, tx?: any): Promise<Dispute | undefined> {
    const db = tx || (await getDb());
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, id))
      .limit(1);
    return dispute as Dispute | undefined;
  }

  async updateDispute(id: number, data: Partial<Dispute>, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db
      .update(disputes)
      .set(data)
      .where(eq(disputes.id, id));
  }

  async saveOutboxEvent(event: {
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    payload: any;
    status: string;
  }, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(outboxEvents).values(event);
  }
}

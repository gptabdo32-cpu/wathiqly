import { eq } from "drizzle-orm";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { escrowContracts, disputes } from "../../../drizzle/schema_escrow_engine";
import { outboxEvents } from "../../../drizzle/schema_outbox";
import { getDb } from "../../../apps/api/db";

export class DrizzleEscrowRepository implements IEscrowRepository {
  async create(data: any, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const [contract] = await db.insert(escrowContracts).values(data);
    return contract.insertId;
  }

  async getById(id: number, tx?: any): Promise<any> {
    const db = tx || (await getDb());
    const [escrow] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, id))
      .limit(1);
    return escrow;
  }

  async updateStatus(id: number, status: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db
      .update(escrowContracts)
      .set({ status })
      .where(eq(escrowContracts.id, id));
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
}

import { eq } from "drizzle-orm";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { escrowContracts } from "../../../drizzle/schema_escrow_engine";
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

  async saveOutboxEvent(event: any, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.insert(outboxEvents).values(event);
  }
}

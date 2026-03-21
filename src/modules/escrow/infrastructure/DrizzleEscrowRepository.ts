import { eq } from "drizzle-orm";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { escrowContracts, disputes } from "../../../drizzle/schema_escrow_engine";
import { outboxEvents } from "../../../drizzle/schema_outbox";
import { getDb } from "../../../apps/api/db";

export class DrizzleEscrowRepository implements IEscrowRepository {
  async create(escrow: Escrow, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const props = escrow.getProps();
    const [result] = await db.insert(escrowContracts).values({
      buyerId: props.buyerId,
      sellerId: props.sellerId,
      buyerLedgerAccountId: props.buyerLedgerAccountId,
      escrowLedgerAccountId: props.escrowLedgerAccountId,
      amount: props.amount,
      status: props.status,
      description: props.description,
      blockchainStatus: props.blockchainStatus,
    });
    return result.insertId;
  }

  async getById(id: number, tx?: any): Promise<Escrow | null> {
    const db = tx || (await getDb());
    const [row] = await db
      .select()
      .from(escrowContracts)
      .where(eq(escrowContracts.id, id))
      .limit(1);
    
    if (!row) return null;
    
    return Escrow.fromPersistence({
      id: row.id,
      buyerId: row.buyerId,
      sellerId: row.sellerId,
      amount: row.amount,
      status: row.status as any,
      description: row.description,
      buyerLedgerAccountId: row.buyerLedgerAccountId,
      escrowLedgerAccountId: row.escrowLedgerAccountId,
      blockchainStatus: row.blockchainStatus as any,
    });
  }

  async update(escrow: Escrow, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    const props = escrow.getProps();
    if (!props.id) throw new Error("Cannot update escrow without ID");
    
    await db
      .update(escrowContracts)
      .set({
        status: props.status,
        blockchainStatus: props.blockchainStatus,
        buyerLedgerAccountId: props.buyerLedgerAccountId,
        escrowLedgerAccountId: props.escrowLedgerAccountId,
      })
      .where(eq(escrowContracts.id, props.id));
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

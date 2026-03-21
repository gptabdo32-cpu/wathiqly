import { eq } from "drizzle-orm";
import { IEscrowRepository } from "../domain/IEscrowRepository";
import { Escrow } from "../domain/Escrow";
import { escrowContracts, disputes } from "../../../drizzle/schema_escrow_engine";
import { outboxEvents } from "../../../drizzle/schema_outbox";
import { getDb } from "../../../apps/api/db";
import { EscrowMapper } from "./EscrowMapper";

export class DrizzleEscrowRepository implements IEscrowRepository {
  async create(escrow: Escrow, tx?: any): Promise<number> {
    const db = tx || (await getDb());
    const persistence = EscrowMapper.toPersistence(escrow);
    const [result] = await db.insert(escrowContracts).values({
      buyerId: persistence.buyerId,
      sellerId: persistence.sellerId,
      buyerLedgerAccountId: persistence.buyerLedgerAccountId,
      escrowLedgerAccountId: persistence.escrowLedgerAccountId,
      amount: persistence.amount,
      status: persistence.status,
      description: persistence.description,
      blockchainStatus: persistence.blockchainStatus,
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
    
    return EscrowMapper.toDomain(row);
  }

  async update(escrow: Escrow, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    const persistence = EscrowMapper.toPersistence(escrow);
    if (!persistence.id) throw new Error("Cannot update escrow without ID");
    
    await db
      .update(escrowContracts)
      .set({
        status: persistence.status,
        blockchainStatus: persistence.blockchainStatus,
        buyerLedgerAccountId: persistence.buyerLedgerAccountId,
        escrowLedgerAccountId: persistence.escrowLedgerAccountId,
      })
      .where(eq(escrowContracts.id, persistence.id));
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

  async updateEscrowBlockchainStatus(escrowId: number, blockchainStatus: "none" | "pending" | "confirmed" | "failed", lastTxHash: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.update(escrowContracts)
      .set({ blockchainStatus, lastTxHash })
      .where(eq(escrowContracts.id, escrowId));
  }

  async updateDisputeBlockchainStatus(disputeId: number, blockchainTxHash: string, tx?: any): Promise<void> {
    const db = tx || (await getDb());
    await db.update(disputes)
      .set({ blockchainTxHash })
      .where(eq(disputes.id, disputeId));
  }
}

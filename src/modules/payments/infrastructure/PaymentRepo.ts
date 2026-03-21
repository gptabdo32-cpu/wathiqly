import { IPaymentRepo, ITransactionManager } from "../application/interfaces";
import { Payment, PaymentStatus } from "../domain/payment";

/**
 * Drizzle Implementation of Payment Repository
 */
export class DrizzlePaymentRepo implements IPaymentRepo {
  constructor(private db: any) {}

  async save(payment: Payment, transaction?: any): Promise<Payment> {
    const db = transaction || this.db;
    console.log("INFRASTRUCTURE: Saving payment to DB...", payment);
    // Real implementation:
    // const [inserted] = await db.insert(payments).values(payment).returning();
    // return inserted;
    return { ...payment, id: "payment-id-" + Date.now() };
  }

  async findById(id: string): Promise<Payment | null> {
    console.log("INFRASTRUCTURE: Finding payment by ID...", id);
    return null;
  }

  async updateStatus(id: string, status: PaymentStatus, reference?: string): Promise<void> {
    console.log(`INFRASTRUCTURE: Updating payment ${id} to status ${status} with reference ${reference}`);
  }
}

/**
 * Transaction Manager Implementation
 */
export class DrizzleTransactionManager implements ITransactionManager {
  constructor(private db: any) {}

  async runInTransaction<T>(work: (trx: any) => Promise<T>): Promise<T> {
    console.log("INFRASTRUCTURE: Starting DB Transaction...");
    // Real implementation:
    // return await this.db.transaction(work);
    const mockTrx = {};
    const result = await work(mockTrx);
    console.log("INFRASTRUCTURE: Committing DB Transaction.");
    return result;
  }
}

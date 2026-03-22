import { getDb } from "../../infrastructure/db";
import { sql } from "drizzle-orm";
import { Logger } from "../observability/Logger";

export interface AuditLogEntry {
  userId: number;
  action: string;
  entityType: string;
  entityId: number | string;
  oldValue?: any;
  newValue?: any;
  correlationId: string;
  metadata?: Record<string, any>;
}

/**
 * AuditLogger (Rule 16: Add audit logging for all financial actions)
 */
export class AuditLogger {
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      const db = getDb();
      
      // We'll use a raw SQL insert for now to ensure it works even if schema is being updated
      // In a real system, this would be a dedicated 'audit_logs' table in Drizzle
      await db.execute(sql`
        INSERT INTO audit_logs (
          user_id, action, entity_type, entity_id, 
          old_value, new_value, correlation_id, metadata, created_at
        ) VALUES (
          ${entry.userId}, ${entry.action}, ${entry.entityType}, ${entry.entityId},
          ${JSON.stringify(entry.oldValue)}, ${JSON.stringify(entry.newValue)},
          ${entry.correlationId}, ${JSON.stringify(entry.metadata)}, NOW()
        )
      `);

      Logger.info(`[AuditLog][CID:${entry.correlationId}] ${entry.action} on ${entry.entityType}:${entry.entityId}`);
    } catch (error) {
      // Rule 15: Prevent silent failures
      Logger.error(`[AuditLog] FAILED to log action: ${entry.action}`, error as Error);
      throw error; 
    }
  }
}

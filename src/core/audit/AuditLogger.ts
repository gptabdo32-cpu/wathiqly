import { getDb } from "../../infrastructure/db";
import { auditLogs } from "../../infrastructure/db/schema_audit";
import { Logger } from "../observability/Logger";

export interface AuditLogEntry {
  userId: number;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  correlationId: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * AuditLogger (Rule 16: Add audit logging for all financial actions)
 * MISSION: Ensure full replayability and auditability of all system actions.
 * RULE 13: Remove all "any" types
 */
export class AuditLogger {
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      const db = getDb();
      
      await db.insert(auditLogs).values({
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.oldValue ?? null,
        newValue: entry.newValue ?? null,
        correlationId: entry.correlationId,
        metadata: entry.metadata ?? null,
      });

      Logger.info(`[AuditLog][CID:${entry.correlationId}] ${entry.action} on ${entry.entityType}:${entry.entityId}`);
    } catch (error) {
      // Rule 15: Prevent silent failures
      Logger.error(`[AuditLog] FAILED to log action: ${entry.action}`, error as Error);
      throw error; 
    }
  }
}

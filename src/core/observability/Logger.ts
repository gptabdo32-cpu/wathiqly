/**
 * Observability Logger (Enhanced for Distributed Systems)
 * 
 * MISSION: Add correlationId tracking, full audit trail, and event tracing.
 */
export class Logger {
  static info(message: string, context: { correlationId?: string; [key: string]: any } = {}) {
    const { correlationId, ...rest } = context;
    const cidPrefix = correlationId ? `[CID: ${correlationId}] ` : "";
    console.log(`[INFO] ${new Date().toISOString()} - ${cidPrefix}${message}`, Object.keys(rest).length ? JSON.stringify(rest) : "");
  }

  static warn(message: string, context: { correlationId?: string; [key: string]: any } = {}) {
    const { correlationId, ...rest } = context;
    const cidPrefix = correlationId ? `[CID: ${correlationId}] ` : "";
    console.warn(`[WARN] ${new Date().toISOString()} - ${cidPrefix}${message}`, Object.keys(rest).length ? JSON.stringify(rest) : "");
  }

  static error(message: string, error?: any, context: { correlationId?: string; [key: string]: any } = {}) {
    const { correlationId, ...rest } = context;
    const cidPrefix = correlationId ? `[CID: ${correlationId}] ` : "";
    console.error(`[ERROR] ${new Date().toISOString()} - ${cidPrefix}${message}`, error, Object.keys(rest).length ? JSON.stringify(rest) : "");
  }

  /**
   * Audit Trail (Task 9)
   * Records critical business state changes.
   */
  static audit(action: string, actorId: string | number, status: "SUCCESS" | "FAILURE", context: { correlationId: string; [key: string]: any }) {
    console.log(`[AUDIT] ${new Date().toISOString()} - Action: ${action} | Actor: ${actorId} | Status: ${status} | CID: ${context.correlationId}`, JSON.stringify(context));
  }
}

/**
 * Observability Logger (Enhanced for Distributed Systems)
 * 
 * MISSION: Add correlationId tracking, full audit trail, and event tracing.
 * SCHEMA:
 * - eventId: Unique ID for the event
 * - sagaId: Unique ID for the saga
 * - correlationId: Links all events in a single business flow
 * - status: Current status of the operation
 * - retryCount: Number of retries attempted
 * - workerId: ID of the worker processing the task
 * - timestamps: ISO string of the log entry
 */
export class Logger {
  private static getTimestamp(): string {
    return new Date().toISOString();
  }

  private static formatContext(context: { 
    correlationId?: string; 
    eventId?: string;
    sagaId?: string;
    status?: string;
    retryCount?: number;
    workerId?: string;
    [key: string]: any 
  }) {
    const { correlationId, eventId, sagaId, status, retryCount, workerId, ...rest } = context;
    
    const metadata: any = { ...rest };
    if (correlationId) metadata.correlationId = correlationId;
    if (eventId) metadata.eventId = eventId;
    if (sagaId) metadata.sagaId = sagaId;
    if (status) metadata.status = status;
    if (retryCount !== undefined) metadata.retryCount = retryCount;
    if (workerId) metadata.workerId = workerId;
    metadata.timestamp = this.getTimestamp();

    const prefixParts = [];
    if (correlationId) prefixParts.push(`CID:${correlationId}`);
    if (eventId) prefixParts.push(`EID:${eventId}`);
    if (sagaId) prefixParts.push(`SID:${sagaId}`);
    
    const prefix = prefixParts.length > 0 ? `[${prefixParts.join("|")}] ` : "";
    return { prefix, metadata };
  }

  static info(message: string, context: any = {}) {
    const { prefix, metadata } = this.formatContext(context);
    console.log(`[INFO] ${metadata.timestamp} - ${prefix}${message}`, Object.keys(metadata).length ? JSON.stringify(metadata) : "");
  }

  static warn(message: string, context: any = {}) {
    const { prefix, metadata } = this.formatContext(context);
    console.warn(`[WARN] ${metadata.timestamp} - ${prefix}${message}`, Object.keys(metadata).length ? JSON.stringify(metadata) : "");
  }

  static error(message: string, error?: any, context: any = {}) {
    const { prefix, metadata } = this.formatContext(context);
    const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    console.error(`[ERROR] ${metadata.timestamp} - ${prefix}${message}`, JSON.stringify({ ...metadata, error: errorInfo }));
  }

  /**
   * Audit Trail (Task 9)
   * Records critical business state changes.
   */
  static audit(action: string, actorId: string | number, status: "SUCCESS" | "FAILURE", context: { correlationId: string; [key: string]: any }) {
    const { prefix, metadata } = this.formatContext(context);
    console.log(`[AUDIT] ${metadata.timestamp} - Action: ${action} | Actor: ${actorId} | Status: ${status} | ${prefix}`, JSON.stringify(metadata));
  }

  /**
   * Metrics Logging
   * Records custom metrics for monitoring and analysis.
   */
  static metric(name: string, value: number, tags: { [key: string]: string | number } = {}) {
    console.log(`[METRIC] ${this.getTimestamp()} - Name: ${name} | Value: ${value} | Tags: ${JSON.stringify(tags)}`);
  }

  /**
   * Debug Logging (Added for compatibility)
   */
  static debug(message: string, context: any = {}) {
    const { prefix, metadata } = this.formatContext(context);
    console.debug(`[DEBUG] ${metadata.timestamp} - ${prefix}${message}`, Object.keys(metadata).length ? JSON.stringify(metadata) : "");
  }
}

/**
 * Observability Logger (Production-Grade)
 * 
 * MISSION: Standardized structured logging for distributed tracing and observability.
 * SCHEMA:
 * - eventId: Unique ID for the event
 * - sagaId: Unique ID for the saga
 * - correlationId: Links all events in a single business flow
 * - status: Current status of the operation
 * - retryCount: Number of retries attempted
 * - workerId: ID of the worker processing the task
 * - timestamp: ISO string of the log entry
 */
export class Logger {
  private static getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Standardizes the log context to match the required schema.
   */
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
    console.log(`[INFO] ${metadata.timestamp} - ${prefix}${message}`, JSON.stringify(metadata));
  }

  static warn(message: string, context: any = {}) {
    const { prefix, metadata } = this.formatContext(context);
    console.warn(`[WARN] ${metadata.timestamp} - ${prefix}${message}`, JSON.stringify(metadata));
  }

  static error(message: string, error?: any, context: any = {}) {
    const { prefix, metadata } = this.formatContext(context);
    const errorInfo = error instanceof Error ? { 
      message: error.message, 
      stack: error.stack,
      name: error.name
    } : { error };
    
    console.error(`[ERROR] ${metadata.timestamp} - ${prefix}${message}`, JSON.stringify({ 
      ...metadata, 
      ...errorInfo 
    }));
  }

  /**
   * Audit Trail
   * Records critical business state changes for compliance and debugging.
   */
  static audit(action: string, actorId: string | number, status: "SUCCESS" | "FAILURE", context: { correlationId: string; [key: string]: any }) {
    const { prefix, metadata } = this.formatContext(context);
    console.log(`[AUDIT] ${metadata.timestamp} - Action: ${action} | Actor: ${actorId} | Status: ${status} | ${prefix}`, JSON.stringify({
      ...metadata,
      action,
      actorId,
      auditStatus: status
    }));
  }

  /**
   * Metrics Logging (Prometheus-ready format)
   * Records custom metrics for monitoring.
   */
  static metric(name: string, value: number, tags: { [key: string]: string | number } = {}) {
    const timestamp = this.getTimestamp();
    // Standard Prometheus-like structured log for easier parsing
    console.log(`[METRIC] ${timestamp} - name=${name} value=${value} tags=${JSON.stringify(tags)}`);
  }

  static debug(message: string, context: any = {}) {
    if (process.env.NODE_ENV === 'production') return;
    const { prefix, metadata } = this.formatContext(context);
    console.debug(`[DEBUG] ${metadata.timestamp} - ${prefix}${message}`, JSON.stringify(metadata));
  }
}

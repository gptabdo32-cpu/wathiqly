import { getDb } from "../../infrastructure/db";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { eq, asc, and } from "drizzle-orm";
import { Logger } from "../observability/Logger";
import { ReplayIsolation } from "./ReplayIsolation";
import { v4 as uuidv4 } from 'uuid';

/**
 * Event Replay System (Improvement 5, 12, 19)
 * MISSION: Enable full system reconstruction from events with strict isolation.
 */
export class EventReplay {
  private static replayIsolation = new ReplayIsolation();

  /**
   * Replay events for a specific aggregate with side-effect isolation
   * Improvement 5: Isolate side effects during Event Replay
   */
  static async replayAggregate(params: {
    aggregateType: string;
    aggregateId: string | number;
    correlationId?: string;
  }): Promise<any[]> {
    const { aggregateType, aggregateId, correlationId = uuidv4() } = params;
    const replayId = `replay_${aggregateType}_${aggregateId}_${Date.now()}`;
    
    const db = await getDb();
    
    Logger.info(`[EventReplay][CID:${correlationId}] Starting isolated replay for ${aggregateType} #${aggregateId}`);
    
    // Start isolated replay session
    this.replayIsolation.startReplay({ replayId, correlationId });

    try {
      const events = await db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.aggregateType, aggregateType),
            eq(outboxEvents.aggregateId, Number(aggregateId))
          )
        )
        .orderBy(asc(outboxEvents.createdAt));

      Logger.info(`[EventReplay][CID:${correlationId}] Found ${events.length} events to replay.`);

      return events.map(e => ({
        type: e.eventType,
        payload: e.payload,
        timestamp: e.createdAt,
        version: e.version,
        eventId: e.eventId,
      }));
    } finally {
      // End replay session - side effects are deferred and not executed
      const deferred = this.replayIsolation.endReplay(replayId);
      if (deferred.length > 0) {
        Logger.warn(`[EventReplay][CID:${correlationId}] Detected and isolated ${deferred.length} side effects during replay.`);
      }
    }
  }

  /**
   * Guarantee deterministic results (Improvement 5, 19)
   */
  static async reconstructState(
    aggregateType: string, 
    aggregateId: string | number, 
    reducer: (state: any, event: any) => any, 
    initialState: any,
    correlationId?: string
  ): Promise<any> {
    const events = await this.replayAggregate({ aggregateType, aggregateId, correlationId });
    return events.reduce(reducer, initialState);
  }

  /**
   * Helper to ensure an operation is not executed during replay
   */
  static assertNotReplaying(operationName: string, correlationId: string, replayId?: string) {
    this.replayIsolation.assertNotInReplay({
      operationName,
      correlationId,
      replayId
    });
  }
}

export default EventReplay;

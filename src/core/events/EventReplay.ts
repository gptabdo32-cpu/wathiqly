import { getDb } from "../../infrastructure/db";
import { outboxEvents } from "../../infrastructure/db/schema_outbox";
import { eq, asc } from "drizzle-orm";
import { Logger } from "../observability/Logger";

/**
 * Event Replay System (Rule 9)
 * MISSION: Enable full system reconstruction from events.
 */
export class EventReplay {
  /**
   * Replay events for a specific aggregate
   */
  static async replayAggregate(aggregateType: string, aggregateId: string): Promise<any[]> {
    const db = await getDb();
    
    Logger.info(`[EventReplay] Replaying events for ${aggregateType} #${aggregateId}`);

    const events = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateType, aggregateType),
          eq(outboxEvents.aggregateId, aggregateId)
        )
      )
      .orderBy(asc(outboxEvents.createdAt));

    Logger.info(`[EventReplay] Found ${events.length} events to replay.`);

    return events.map(e => ({
      type: e.eventType,
      payload: e.payload,
      timestamp: e.createdAt,
      version: e.version,
    }));
  }

  /**
   * Guarantee deterministic results (Rule 9)
   */
  static async reconstructState(aggregateType: string, aggregateId: string, reducer: (state: any, event: any) => any, initialState: any): Promise<any> {
    const events = await this.replayAggregate(aggregateType, aggregateId);
    return events.reduce(reducer, initialState);
  }
}

// Helper for Drizzle imports
import { and } from "drizzle-orm";

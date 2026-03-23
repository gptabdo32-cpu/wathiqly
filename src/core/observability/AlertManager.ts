import { Logger } from "./Logger";
import { Gauge, Counter } from "prom-client";

/**
 * Failure Visibility (Rule 18)
 * MISSION: Ensure every failure is visible and no silent failure exists.
 */
export class AlertManager {
  
  // Alert Metrics
  private static alertCounter = new Counter({
    name: 'wathiqly_alerts_total',
    help: 'Total number of alerts triggered',
    labelNames: ['severity', 'type']
  });

  /**
   * Condition 1: High Retry Rate
   * Triggered when outbox or event retries exceed a threshold.
   */
  static async checkHighRetryRate(retryCount: number, threshold: number = 5) {
    if (retryCount > threshold) {
      this.triggerAlert("CRITICAL", "High Retry Rate", { retryCount });
    }
  }

  /**
   * Condition 2: DLQ Growth
   * Triggered when events are moved to the Dead Letter Queue.
   */
  static async checkDlqGrowth(dlqCount: number) {
    if (dlqCount > 0) {
      this.triggerAlert("CRITICAL", "DLQ Growth Detected", { dlqCount });
    }
  }

  /**
   * Condition 3: Stuck Sagas
   * Triggered when sagas remain in a non-final state for too long.
   */
  static async checkStuckSagas(stuckCount: number) {
    if (stuckCount > 0) {
      this.triggerAlert("WARNING", "Stuck Sagas Detected", { stuckCount });
    }
  }

  /**
   * Trigger an alert with severity and metadata.
   */
  private static triggerAlert(severity: "WARNING" | "CRITICAL", type: string, metadata: any) {
    Logger.error(`[ALERT][${severity}] ${type}`, null, metadata);
    this.alertCounter.inc({ severity, type });
    // Implementation: Send to Slack, PagerDuty, or Email
  }
}

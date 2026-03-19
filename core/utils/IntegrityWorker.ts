import { IntegrityCheckService } from "./IntegrityCheckService";

/**
 * IntegrityWorker
 * A background worker that periodically runs integrity checks on the financial system.
 */
export class IntegrityWorker {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private checkIntervalMs: number = 5 * 60 * 1000) { // Default to 5 minutes
    console.log(`[IntegrityWorker] Initialized with check interval: ${this.checkIntervalMs / 1000} seconds`);
  }

  start() {
    if (this.intervalId) {
      console.warn("[IntegrityWorker] Worker already running.");
      return;
    }

    console.log("[IntegrityWorker] Starting integrity checks...");
    this.intervalId = setInterval(async () => {
      try {
        console.log("[IntegrityWorker] Running ledger integrity check...");
        const ledgerIntegrity = await IntegrityCheckService.verifyLedgerIntegrity();
        if (!ledgerIntegrity.isValid) {
          console.error("[IntegrityWorker] Ledger integrity check failed! Corrupted transactions:", ledgerIntegrity.corruptedTransactions);
          // TODO: Implement alerting mechanism (e.g., send email, slack notification)
        } else {
          console.log("[IntegrityWorker] Ledger integrity check passed.");
        }

        // TODO: Add more integrity checks here (e.g., escrow integrity, balance consistency for all accounts)

      } catch (error) {
        console.error("[IntegrityWorker] Error during integrity check:", error);
        // TODO: Implement error reporting
      }
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[IntegrityWorker] Integrity checks stopped.");
    }
  }
}

// Example usage (if running as a standalone script)
// const worker = new IntegrityWorker();
// worker.start();

// process.on("SIGINT", () => {
//   worker.stop();
//   process.exit();
// });

/**
 * Observability Logger
 * Phase 3.8: Observability (Logging)
 * Using a unified logging interface for better tracking and debugging.
 */
export class Logger {
  static info(message: string, context?: any) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : "");
  }

  static warn(message: string, context?: any) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : "");
  }

  static error(message: string, error?: any) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  }
}

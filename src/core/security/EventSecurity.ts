import * as crypto from 'crypto';
import { Logger } from '../observability/Logger';

/**
 * Event Security Layer (Rule 5)
 * MISSION: Ensure event integrity and authenticity using HMAC-SHA256.
 */
export class EventSecurity {
  private static readonly SECRET = process.env.EVENT_SIGNING_SECRET || 'bank-grade-secret-change-me';

  /**
   * Sign an event payload
   */
  static sign(payload: any): string {
    const hmac = crypto.createHmac('sha256', this.SECRET);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Validate an event signature
   */
  static validate(payload: any, signature: string): boolean {
    const expectedSignature = this.sign(payload);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      Logger.error(`[EventSecurity] Invalid event signature detected! Potential tampering.`);
    }

    return isValid;
  }
}

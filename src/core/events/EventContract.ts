import { z } from "zod";
import { EventSecurity } from "../security/EventSecurity";

/**
 * Event Contract Registry (Rule 4, 17, 18)
 * MISSION: Enforce strict schema validation, versioning, and security for all events.
 */

export const EventHeaderSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.union([z.string(), z.number()]),
  version: z.number().int().positive(), // Rule 6: Event Versioning
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  idempotencyKey: z.string(),
  signature: z.string().optional(), // Rule 5: Event Security Layer
});

export type EventHeader = z.infer<typeof EventHeaderSchema>;

/**
 * Domain Specific Event Payloads
 */
export const EventSchemas = {
  // Escrow Domain
  "escrow.created": z.object({
    escrowId: z.number(),
    buyerId: z.number(),
    sellerId: z.number(),
    amount: z.string(),
    currency: z.string().default("SAR"),
  }),
  "escrow.saga.completed": z.object({
    escrowId: z.number(),
    status: z.string(),
    timestamp: z.string(),
  }),
  
  // Payment Domain
  "payment.authorize.requested": z.object({
    escrowId: z.number(),
    amount: z.string(),
    currency: z.string().default("SAR"),
    paymentMethod: z.string(),
  }),
  "payment.authorized": z.object({
    paymentId: z.string(),
    escrowId: z.number(),
    amount: z.string(),
  }),
  "payment.capture.requested": z.object({
    paymentId: z.string(),
    escrowId: z.number(),
  }),
  "payment.captured": z.object({
    paymentId: z.string(),
    escrowId: z.number(),
    capturedAmount: z.string(),
  }),
  "payment.failed": z.object({
    escrowId: z.number(),
    reason: z.string(),
    code: z.string().optional(),
  }),
  "payment.refund.requested": z.object({
    paymentId: z.string(),
    reason: z.string(),
  }),
} as const;

export type EventType = keyof typeof EventSchemas;

/**
 * Full Event Contract
 */
export function validateEvent<T extends EventType>(
  type: T,
  header: unknown,
  payload: unknown,
  shouldSign: boolean = true
) {
  const validatedHeader = EventHeaderSchema.parse(header);
  const schema = EventSchemas[type];
  if (!schema) {
    throw new Error(`No schema defined for event type: ${type}`);
  }
  const validatedPayload = schema.parse(payload);
  
  const event = {
    ...validatedHeader,
    eventType: type,
    payload: validatedPayload as z.infer<typeof schema>,
  };

  // Rule 5: Add signature if requested
  if (shouldSign && !event.signature) {
    event.signature = EventSecurity.sign(event.payload);
  }

  // Rule 5: Validate signature if present
  if (event.signature) {
    const isValid = EventSecurity.validate(event.payload, event.signature);
    if (!isValid) {
      throw new Error(`Invalid event signature for event ${event.eventId}`);
    }
  }
  
  return event;
}

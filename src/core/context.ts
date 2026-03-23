import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { v4 as uuidv4 } from 'uuid';
import { Logger } from "./observability/Logger";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getDb } from "../db"; // Import the getDb function
import { schema } from "../../drizzle/schema"; // Import the schema
import * as storage from "../storage"; // Import storage utilities
import * as encryption from "./encryption"; // Import encryption utilities

export type TrpcContext = {
  correlationId: string;
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  db: Awaited<ReturnType<typeof getDb>>; // Add db to context
  schema: typeof schema; // Add schema to context
  storage: typeof storage; // Add storage to context
  encryption: typeof encryption; // Add encryption to context
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const correlationId = opts.req.headers['x-correlation-id']?.toString() || uuidv4();
  Logger.info("Incoming request", { correlationId, path: opts.req.path, method: opts.req.method });
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    correlationId,
    req: opts.req,
    res: opts.res,
    user,
    db: (await getDb())!, // Pass db instance
    schema, // Pass schema
    storage, // Pass storage utilities
    encryption, // Pass encryption utilities
  };
}

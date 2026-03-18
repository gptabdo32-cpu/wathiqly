import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getDb } from "../db"; // Import the getDb function
import { schema } from "../../drizzle/schema"; // Import the schema
import * as storage from "../storage"; // Import storage utilities
import * as encryption from "./encryption"; // Import encryption utilities

export type TrpcContext = {
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
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    db: (await getDb())!, // Pass db instance
    schema, // Pass schema
    storage, // Pass storage utilities
    encryption, // Pass encryption utilities
  };
}

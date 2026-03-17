import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { apiClients } from "../../drizzle/schema_diaas";
import { getDb } from "../db";
import { hashData } from "./encryption";

/**
 * Authenticate a DIaaS Business Client using Client ID and Client Secret
 * @param clientId - The client's unique identifier
 * @param clientSecret - The client's secret key
 * @returns The authenticated client object
 */
export async function authenticateBusinessClient(clientId: string, clientSecret: string) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database connection failed.",
    });
  }

  // 1. Fetch client by ID
  const client = await db.select().from(apiClients).where(eq(apiClients.clientId, clientId)).limit(1);
  
  if (client.length === 0) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid Client ID.",
    });
  }

  const businessClient = client[0];

  // 2. Check if client is active
  if (!businessClient.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Business client account is inactive.",
    });
  }

  // 3. Verify Client Secret
  const secretHash = hashData(clientSecret);
  if (secretHash !== businessClient.clientSecretHash) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid Client Secret.",
    });
  }

  return businessClient;
}

/**
 * Check if a business client has the required scope for an operation
 * @param client - The authenticated client object
 * @param requiredScope - The scope required for the operation
 * @returns True if the client has the scope, otherwise throws a TRPCError
 */
export function authorizeScope(client: { allowedScopes: any }, requiredScope: string) {
  const scopes = client.allowedScopes as string[];
  
  if (!scopes || !scopes.includes(requiredScope)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient permissions. Required scope: ${requiredScope}`,
    });
  }
  
  return true;
}

/**
 * Generate a new Client ID and Secret for a business
 */
export function generateClientCredentials() {
  const clientId = `wth_client_${Math.random().toString(36).substring(2, 15)}`;
  const clientSecret = `wth_secret_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  
  return { clientId, clientSecret };
}

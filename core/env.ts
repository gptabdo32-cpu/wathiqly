const requiredEnv = {
  appId: process.env.VITE_APP_ID,
  cookieSecret: process.env.JWT_SECRET,
  serverSecret: process.env.SERVER_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL,
  encryptionKey: process.env.ENCRYPTION_KEY,
};

const isProduction = process.env.NODE_ENV === "production";

// Check for missing required environment variables
Object.entries(requiredEnv).forEach(([key, value]) => {
  if (!value) {
    if (isProduction) {
      throw new Error(`Critical Environment Variable Missing: ${key}. Production environment cannot start without it.`);
    } else {
      console.warn(`Warning: Environment Variable Missing: ${key}. Using development default.`);
    }
  }
});

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "default_app_id",
  cookieSecret: process.env.JWT_SECRET ?? (isProduction ? undefined : "development_secret_only_do_not_use_in_prod"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? (isProduction ? undefined : "0000000000000000000000000000000000000000000000000000000000000000"), // 64 hex chars for 32 bytes
  serverSecret: process.env.SERVER_SECRET ?? (isProduction ? undefined : "another-super-secret-key-for-audit-trail"),
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  maxUploadSizeMB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || "10", 10),
  allowedUploadMimeTypes: process.env.ALLOWED_UPLOAD_MIME_TYPES?.split(",") || ["image/jpeg", "image/png", "application/pdf"],
};

if (isProduction && (!ENV.cookieSecret || !ENV.encryptionKey || !ENV.serverSecret)) {
  throw new Error("Critical Security Error: JWT_SECRET or ENCRYPTION_KEY is missing in production.");
}

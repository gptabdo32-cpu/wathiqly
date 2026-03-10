const requiredEnv = {
  appId: process.env.VITE_APP_ID,
  cookieSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL,
};

// Check for missing required environment variables in production
if (process.env.NODE_ENV === "production") {
  Object.entries(requiredEnv).forEach(([key, value]) => {
    if (!value) {
      throw new Error(`Critical Environment Variable Missing: ${key}. Production environment cannot start without it.`);
    }
  });
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "default_app_id",
  cookieSecret: process.env.JWT_SECRET ?? "development_secret_only_do_not_use_in_prod",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

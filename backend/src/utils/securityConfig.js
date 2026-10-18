const DEFAULT_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function getAllowedOrigins(env = process.env) {
  const configured = [env.CLIENT_URL, env.CORS_ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const origins = new Set(configured);
  if (env.NODE_ENV !== "production") DEFAULT_DEV_ORIGINS.forEach((origin) => origins.add(origin));
  return [...origins];
}

function isOriginAllowed(origin, allowedOrigins) {
  // Non-browser clients and same-origin requests may omit Origin.
  if (!origin) return true;
  return allowedOrigins.includes(origin.replace(/\/$/, ""));
}

function roleIsAllowed(role, allowedRoles) {
  return typeof role === "string" && Array.isArray(allowedRoles) && allowedRoles.includes(role);
}

function assertProductionSecrets(env = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (typeof env.JWT_SECRET !== "string" || env.JWT_SECRET.length < 32 || /replace_with|change_me|your_secret/i.test(env.JWT_SECRET)) {
    throw new Error("Production requires a strong JWT_SECRET of at least 32 characters.");
  }
  if (!env.MONGODB_URI) throw new Error("Production requires MONGODB_URI.");
  if (!env.CLIENT_URL && !env.CORS_ALLOWED_ORIGINS) throw new Error("Production requires CLIENT_URL or CORS_ALLOWED_ORIGINS.");
}

module.exports = { getAllowedOrigins, isOriginAllowed, roleIsAllowed, assertProductionSecrets };

const APPROVED_SCOPES = new Set([
  "read_all_orders",
  "read_customers",
  "read_orders",
  "read_payment_terms",
]);

const REQUIRED_VALUES = [
  "DATABASE_URL",
  "SESSION_ENCRYPTION_KEY",
  "SESSION_ENCRYPTION_KEY_ID",
  "PRIVACY_TOMBSTONE_KEY",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SHOPIFY_PARTNER_ORGANIZATION_ID",
  "SHOPIFY_PARTNER_ACCESS_TOKEN",
  "SHOPIFY_PARTNER_APP_GID",
  "SHOPIFY_APP_HANDLE",
  "SHOPIFY_PLAN_HANDLE_FREE",
  "SHOPIFY_PLAN_HANDLE_STARTER",
  "SHOPIFY_PLAN_HANDLE_GROWTH",
  "SHOPIFY_PLAN_HANDLE_SCALE",
  "SHOPIFY_PLAN_HANDLE_TEST",
  "POSTMARK_SERVER_TOKEN",
  "POSTMARK_FROM_EMAIL",
  "POSTMARK_MESSAGE_STREAM",
  "POSTMARK_WEBHOOK_TOKEN",
  "RELEASE_VERSION",
  "SCOPES",
] as const;

type DeploymentEnvironment = Record<string, string | undefined>;

function isThirtyTwoByteBase64(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const decoded = Buffer.from(value, "base64");
    return (
      decoded.length === 32 &&
      decoded.toString("base64").replace(/=+$/u, "") ===
        value.replace(/=+$/u, "")
    );
  } catch {
    return false;
  }
}

function isHttpsOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      !new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)
    );
  } catch {
    return false;
  }
}

function isRemotePostgres(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      new Set(["postgres:", "postgresql:"]).has(url.protocol) &&
      Boolean(url.username) &&
      Boolean(url.hostname) &&
      !new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function validateDeploymentEnvironment(
  environment: DeploymentEnvironment,
): string[] {
  const issues: string[] = [];

  for (const key of REQUIRED_VALUES) {
    if (!environment[key]?.trim()) issues.push(`${key} is required`);
  }

  if (!new Set(["staging", "production"]).has(environment.DEPLOYMENT_ENVIRONMENT ?? "")) {
    issues.push("DEPLOYMENT_ENVIRONMENT must be staging or production");
  }
  if (environment.NODE_ENV !== "production") {
    issues.push("NODE_ENV must be production");
  }
  if (environment.PORT !== "3000") {
    issues.push("PORT must be 3000");
  }
  if (!isRemotePostgres(environment.DATABASE_URL)) {
    issues.push("DATABASE_URL must be a non-local PostgreSQL URL");
  }
  if (!isThirtyTwoByteBase64(environment.SESSION_ENCRYPTION_KEY)) {
    issues.push("SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  if (!isThirtyTwoByteBase64(environment.PRIVACY_TOMBSTONE_KEY)) {
    issues.push("PRIVACY_TOMBSTONE_KEY must be a base64-encoded 32-byte key");
  }
  if (
    environment.SESSION_ENCRYPTION_KEY &&
    environment.SESSION_ENCRYPTION_KEY === environment.PRIVACY_TOMBSTONE_KEY
  ) {
    issues.push("PRIVACY_TOMBSTONE_KEY must differ from SESSION_ENCRYPTION_KEY");
  }
  if (!isHttpsOrigin(environment.SHOPIFY_APP_URL)) {
    issues.push("SHOPIFY_APP_URL must be a non-local HTTPS origin");
  }

  const configuredScopes = (environment.SCOPES ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const configuredScopeSet = new Set(configuredScopes);
  if (
    configuredScopeSet.size !== APPROVED_SCOPES.size ||
    configuredScopes.length !== configuredScopeSet.size ||
    [...configuredScopeSet].some((scope) => !APPROVED_SCOPES.has(scope))
  ) {
    issues.push("SCOPES must exactly match the approved least-privilege scope set");
  }

  if (!/^[a-f0-9]{7,40}$/u.test(environment.RELEASE_VERSION ?? "")) {
    issues.push("RELEASE_VERSION must be an immutable Git commit SHA");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(environment.POSTMARK_FROM_EMAIL ?? "")) {
    issues.push("POSTMARK_FROM_EMAIL must be a valid email address");
  }
  if ((environment.POSTMARK_WEBHOOK_TOKEN ?? "").length < 32) {
    issues.push("POSTMARK_WEBHOOK_TOKEN must contain at least 32 characters");
  }
  if ((environment.POSTMARK_MESSAGE_STREAM ?? "").toLowerCase() === "outbound") {
    issues.push("POSTMARK_MESSAGE_STREAM must be isolated from the default outbound stream");
  }

  const planHandles = [
    environment.SHOPIFY_PLAN_HANDLE_FREE,
    environment.SHOPIFY_PLAN_HANDLE_STARTER,
    environment.SHOPIFY_PLAN_HANDLE_GROWTH,
    environment.SHOPIFY_PLAN_HANDLE_SCALE,
    environment.SHOPIFY_PLAN_HANDLE_TEST,
  ].filter((value): value is string => Boolean(value));
  if (new Set(planHandles).size !== planHandles.length) {
    issues.push("Shopify plan handles must be distinct");
  }

  return [...new Set(issues)];
}

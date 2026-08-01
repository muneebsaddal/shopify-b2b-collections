type HealthPayload = {
  status?: string;
  release?: string;
};

export {};

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  process.stdout.write(`${path}: ${response.status}\n`);
  return response;
}

const [baseUrlArgument, expectedRelease] = process.argv.slice(2);
if (!baseUrlArgument || !expectedRelease) {
  throw new Error(
    "Usage: npm run deployment:smoke -- https://staging.example.com <git-sha>",
  );
}

const baseUrl = new URL(baseUrlArgument);
if (baseUrl.protocol !== "https:" || baseUrl.origin !== baseUrlArgument) {
  throw new Error("Deployment smoke target must be an HTTPS origin");
}

const healthResponse = await request("/healthz");
const health = (await healthResponse.json()) as HealthPayload;
if (
  !healthResponse.ok ||
  health.status !== "ok" ||
  health.release !== expectedRelease
) {
  throw new Error("Liveness or immutable release check failed");
}

const readinessResponse = await request("/readyz");
const readiness = (await readinessResponse.json()) as HealthPayload;
if (
  !readinessResponse.ok ||
  readiness.status !== "ready" ||
  readiness.release !== expectedRelease
) {
  throw new Error("Database readiness or release check failed");
}

const rootResponse = await request("/");
if (rootResponse.status >= 500) throw new Error("Public application route failed");

const postmarkResponse = await request("/webhooks/postmark", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
if (postmarkResponse.status !== 401) {
  throw new Error("Postmark webhook did not fail closed without authentication");
}

const shopifyResponse = await request("/webhooks/sync", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
if (shopifyResponse.status < 400 || shopifyResponse.status >= 500) {
  throw new Error("Shopify webhook did not reject an unauthenticated request safely");
}

process.stdout.write(`Deployment smoke passed for release ${expectedRelease}.\n`);

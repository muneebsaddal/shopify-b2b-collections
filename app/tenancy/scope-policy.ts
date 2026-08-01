import { createHash } from "node:crypto";

const DEFAULT_REQUIRED_SCOPES = [
  "read_all_orders",
  "read_customers",
  "read_orders",
  "read_payment_terms",
];

export function normalizeScopes(
  scopes: string | readonly string[] | null | undefined,
): string[] {
  const values =
    typeof scopes === "string" ? scopes.split(",") : Array.from(scopes ?? []);

  return [...new Set(values.map((scope) => scope.trim()).filter(Boolean))].sort();
}

export function fingerprintScopes(
  scopes: string | readonly string[] | null | undefined,
): string {
  return createHash("sha256")
    .update(normalizeScopes(scopes).join(","))
    .digest("hex");
}

export function hasRequiredScopes(
  grantedScopes: string | readonly string[] | null | undefined,
): boolean {
  const configuredScopes = normalizeScopes(process.env.SCOPES);
  const required =
    configuredScopes.length > 0 ? configuredScopes : DEFAULT_REQUIRED_SCOPES;
  const granted = new Set(normalizeScopes(grantedScopes));

  return required.every((scope) => granted.has(scope));
}

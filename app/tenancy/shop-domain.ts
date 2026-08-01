const SHOP_DOMAIN_PATTERN =
  /^(?<subdomain>[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.myshopify\.com$/;
const SINGLE_CHARACTER_SHOP_DOMAIN_PATTERN =
  /^[a-z0-9]\.myshopify\.com$/;

export function normalizeShopDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");

  if (
    !SHOP_DOMAIN_PATTERN.test(normalized) &&
    !SINGLE_CHARACTER_SHOP_DOMAIN_PATTERN.test(normalized)
  ) {
    throw new Error("Invalid Shopify shop domain");
  }

  return normalized;
}

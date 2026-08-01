const ACTIVE_SUBSCRIPTION_QUERY = `#graphql
  query D6ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod
      legacySubscriptionId
      currentBillingCycle {
        startTime
        endTime
      }
      items {
        handle
        price {
          active
        }
      }
    }
  }
`;

export type PartnerSubscription = {
  legacySubscriptionId: string | null;
  billingPeriod: string | null;
  currentCycleEnd: Date | null;
  activeItemHandles: string[];
};

export class PartnerApiUnavailableError extends Error {}

export class PartnerApiAdapter {
  configured(): boolean {
    return Boolean(
      process.env.SHOPIFY_PARTNER_ORGANIZATION_ID &&
      process.env.SHOPIFY_PARTNER_ACCESS_TOKEN &&
      process.env.SHOPIFY_PARTNER_APP_GID,
    );
  }

  async activeSubscription(
    shopifyShopGid: string,
  ): Promise<PartnerSubscription | null> {
    const organizationId = process.env.SHOPIFY_PARTNER_ORGANIZATION_ID;
    const accessToken = process.env.SHOPIFY_PARTNER_ACCESS_TOKEN;
    const appId = process.env.SHOPIFY_PARTNER_APP_GID;
    if (!organizationId || !accessToken || !appId) {
      throw new PartnerApiUnavailableError("Partner API is not configured");
    }

    const response = await fetch(
      `https://partners.shopify.com/${encodeURIComponent(organizationId)}/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": accessToken,
        },
        body: JSON.stringify({
          query: ACTIVE_SUBSCRIPTION_QUERY,
          variables: { appId, shopId: shopifyShopGid },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new PartnerApiUnavailableError("Partner API request failed");
    }
    const envelope = (await response.json()) as {
      data?: {
        activeSubscription?: {
          billingPeriod?: string | null;
          legacySubscriptionId?: string | null;
          currentBillingCycle?: { endTime?: string | null } | null;
          items?: Array<{
            handle?: string | null;
            price?: { active?: boolean | null } | null;
          }>;
        } | null;
      };
      errors?: unknown[];
    };
    if (envelope.errors?.length || !envelope.data) {
      throw new PartnerApiUnavailableError(
        "Partner API returned an ambiguous result",
      );
    }
    const subscription = envelope.data.activeSubscription;
    if (!subscription) return null;
    const cycleEnd = subscription.currentBillingCycle?.endTime;
    return {
      legacySubscriptionId: subscription.legacySubscriptionId ?? null,
      billingPeriod: subscription.billingPeriod ?? null,
      currentCycleEnd: cycleEnd ? new Date(cycleEnd) : null,
      activeItemHandles: (subscription.items ?? []).flatMap((item) =>
        item.price?.active && item.handle ? [item.handle] : [],
      ),
    };
  }
}

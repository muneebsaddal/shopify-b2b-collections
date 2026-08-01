import type { SyncWorkKind } from "@prisma/client";

import prisma from "../db.server";
import { ProtectedDataAccessRepository } from "../operations/protected-data-access-repository.server";
import {
  COMPANIES_CONTRACT_QUERY,
  COMPANY_CONTACTS_PAGE_CONTRACT_QUERY,
  COMPANY_LOCATIONS_PAGE_CONTRACT_QUERY,
  RECEIVABLE_ORDER_CONTRACT_QUERY,
  RECEIVABLE_ORDERS_PAGE_CONTRACT_QUERY,
  SHOP_INSTALLATION_CONTRACT_QUERY,
} from "../platform/shopify/contracts/admin-contracts";
import { unauthenticated } from "../shopify.server";
import { hasRequiredScopes, normalizeScopes } from "../tenancy/scope-policy";
import { normalizeShopDomain } from "../tenancy/shop-domain";
import {
  projectCompanies,
  projectCompanyContacts,
  projectCompanyLocations,
  projectOrders,
  repairProjectionDrift,
  type CompanyContactNode,
  type CompanyLocationNode,
  type CompanyNode,
  type OrderNode,
} from "./shopify-projection.server";

const COMPANY_PAGE_SIZE = 25;
const CHILD_PAGE_SIZE = 50;
const ORDER_PAGE_SIZE = 20;
const ORDER_SEARCH_QUERY = "status:any";

type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string | null;
};

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: unknown[];
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
      };
    };
  };
};

async function honorThrottle(envelope: GraphqlEnvelope<unknown>): Promise<void> {
  const status = envelope.extensions?.cost?.throttleStatus;
  const available = status?.currentlyAvailable;
  const restoreRate = status?.restoreRate;
  if (
    available === undefined ||
    restoreRate === undefined ||
    restoreRate <= 0 ||
    available >= 100
  ) {
    return;
  }
  const waitMilliseconds = Math.min(
    Math.ceil(((100 - available) / restoreRate) * 1_000),
    5_000,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
}

async function queryAdmin<T>(
  admin: GraphqlAdmin,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const envelope = (await response.json()) as GraphqlEnvelope<T>;
  await honorThrottle(envelope);
  if (envelope.errors?.length || !envelope.data) {
    throw new Error("shopify_graphql_response_invalid");
  }
  return envelope.data;
}

async function verifyInstallation(
  admin: GraphqlAdmin,
  input: { shopId: string; shopDomain: string },
): Promise<string> {
  const data = await queryAdmin<{
    shop?: {
      id?: string;
      myshopifyDomain?: string;
      ianaTimezone?: string;
    };
    currentAppInstallation?: {
      accessScopes?: Array<{ handle?: string }>;
    };
  }>(admin, SHOP_INSTALLATION_CONTRACT_QUERY, {});
  const domain = normalizeShopDomain(data.shop?.myshopifyDomain ?? "");
  if (!domain || domain !== normalizeShopDomain(input.shopDomain)) {
    throw new Error("shopify_shop_identity_mismatch");
  }
  const scopes = normalizeScopes(
    data.currentAppInstallation?.accessScopes
      ?.map((scope) => scope.handle ?? "")
      .filter(Boolean),
  );
  const scopesComplete = hasRequiredScopes(scopes);
  await prisma.shop.update({
    where: { id: input.shopId },
    data: {
      shopifyShopGid: data.shop?.id,
      timezone: data.shop?.ianaTimezone || "UTC",
      scopesComplete,
      globalRemindersPaused: scopesComplete ? undefined : true,
    },
  });
  if (!scopesComplete) throw new Error("required_shopify_scope_missing");
  return data.shop?.ianaTimezone || "UTC";
}

async function startSweep(
  shopId: string,
  kind: SyncWorkKind,
): Promise<Date> {
  const existing = await prisma.reconciliationCursor.findUnique({
    where: { shopId_resourceType: { shopId, resourceType: "FULL_SYNC" } },
  });
  const canResume =
    (kind === "INITIAL" ||
      kind === "RECONCILIATION" ||
      kind === "MANUAL_RETRY") &&
    existing?.state === "FAILED" &&
    existing.watermark;
  const watermark = canResume ? existing.watermark! : new Date();
  await prisma.reconciliationCursor.upsert({
    where: { shopId_resourceType: { shopId, resourceType: "FULL_SYNC" } },
    create: {
      shopId,
      resourceType: "FULL_SYNC",
      state: "PROCESSING",
      watermark,
    },
    update: {
      state: "PROCESSING",
      watermark,
      cursor: canResume ? existing.cursor : null,
      errorCode: null,
    },
  });
  return watermark;
}

async function prepareResourceCursor(
  shopId: string,
  resourceType: "COMPANIES" | "ORDERS",
  watermark: Date,
): Promise<{ cursor: string | null; completed: boolean }> {
  const existing = await prisma.reconciliationCursor.findUnique({
    where: { shopId_resourceType: { shopId, resourceType } },
  });
  const sameSweep =
    existing?.watermark?.valueOf() === watermark.valueOf();
  if (sameSweep && existing.state === "COMPLETED") {
    return { cursor: existing.cursor, completed: true };
  }
  const cursor =
    sameSweep &&
    (existing?.state === "PROCESSING" || existing?.state === "FAILED")
      ? existing.cursor
      : null;
  await prisma.reconciliationCursor.upsert({
    where: { shopId_resourceType: { shopId, resourceType } },
    create: {
      shopId,
      resourceType,
      cursor,
      watermark,
      state: "PROCESSING",
    },
    update: {
      cursor,
      watermark,
      state: "PROCESSING",
      errorCode: null,
    },
  });
  return { cursor, completed: false };
}

async function updateResourceCursor(input: {
  shopId: string;
  resourceType: "COMPANIES" | "ORDERS";
  cursor: string | null;
  completed: boolean;
  watermark: Date;
}): Promise<void> {
  await prisma.reconciliationCursor.update({
    where: {
      shopId_resourceType: {
        shopId: input.shopId,
        resourceType: input.resourceType,
      },
    },
    data: {
      cursor: input.cursor,
      state: input.completed ? "COMPLETED" : "PROCESSING",
      lastSuccessAt: new Date(),
      lastFullSweepAt: input.completed ? input.watermark : undefined,
      errorCode: null,
    },
  });
}

async function synchronizeLocations(
  admin: GraphqlAdmin,
  input: {
    shopId: string;
    companyGid: string;
    observedAt: Date;
  },
): Promise<void> {
  let cursor: string | null = null;
  do {
    const data: {
      company?: {
        locations?: {
          pageInfo: PageInfo;
          nodes: CompanyLocationNode[];
        };
      } | null;
    } = await queryAdmin(
      admin,
      COMPANY_LOCATIONS_PAGE_CONTRACT_QUERY,
      {
        id: input.companyGid,
        first: CHILD_PAGE_SIZE,
        after: cursor,
      },
    );
    if (!data.company) return;
    const connection = data.company.locations;
    if (!connection) throw new Error("company_locations_connection_missing");
    await prisma.$transaction((transaction) =>
      projectCompanyLocations(transaction, {
        ...input,
        nodes: connection.nodes,
      }),
    );
    cursor = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor ?? null
      : null;
    if (connection.pageInfo.hasNextPage && !cursor) {
      throw new Error("shopify_cursor_missing");
    }
  } while (cursor);
}

async function synchronizeContacts(
  admin: GraphqlAdmin,
  input: {
    shopId: string;
    companyGid: string;
    observedAt: Date;
    correlationId: string;
  },
): Promise<void> {
  let cursor: string | null = null;
  do {
    const data: {
      company?: {
        contacts?: {
          pageInfo: PageInfo;
          nodes: CompanyContactNode[];
        };
      } | null;
    } = await queryAdmin(
      admin,
      COMPANY_CONTACTS_PAGE_CONTRACT_QUERY,
      {
        id: input.companyGid,
        first: CHILD_PAGE_SIZE,
        after: cursor,
      },
    );
    if (!data.company) return;
    const connection = data.company.contacts;
    if (!connection) throw new Error("company_contacts_connection_missing");
    await prisma.$transaction(async (transaction) => {
      await projectCompanyContacts(transaction, {
        shopId: input.shopId,
        companyGid: input.companyGid,
        observedAt: input.observedAt,
        nodes: connection.nodes,
      });
      if (connection.nodes.length > 0) {
        await new ProtectedDataAccessRepository(
          transaction,
          input.shopId,
        ).record({
          actorType: "WORKER",
          purposeCode: "shopify_receivables_sync",
          resourceCategory: "buyer_email",
          action: "project",
          correlationId: input.correlationId,
          outcome: "success",
        });
      }
    });
    cursor = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor ?? null
      : null;
    if (connection.pageInfo.hasNextPage && !cursor) {
      throw new Error("shopify_cursor_missing");
    }
  } while (cursor);
}

async function synchronizeCompanies(
  admin: GraphqlAdmin,
  input: {
    shopId: string;
    observedAt: Date;
    correlationId: string;
  },
): Promise<void> {
  const state = await prepareResourceCursor(
    input.shopId,
    "COMPANIES",
    input.observedAt,
  );
  if (state.completed) return;
  let cursor = state.cursor;
  do {
    const data: {
      companies?: {
        pageInfo: PageInfo;
        nodes: CompanyNode[];
      };
    } = await queryAdmin(admin, COMPANIES_CONTRACT_QUERY, {
      first: COMPANY_PAGE_SIZE,
      after: cursor,
    });
    const connection = data.companies;
    if (!connection) throw new Error("companies_connection_missing");
    await prisma.$transaction((transaction) =>
      projectCompanies(transaction, {
        shopId: input.shopId,
        observedAt: input.observedAt,
        nodes: connection.nodes,
      }),
    );
    for (const company of connection.nodes) {
      await Promise.all([
        synchronizeLocations(admin, {
          shopId: input.shopId,
          companyGid: company.id,
          observedAt: input.observedAt,
        }),
        synchronizeContacts(admin, {
          shopId: input.shopId,
          companyGid: company.id,
          observedAt: input.observedAt,
          correlationId: input.correlationId,
        }),
      ]);
    }
    const nextCursor = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor ?? null
      : null;
    if (connection.pageInfo.hasNextPage && !nextCursor) {
      throw new Error("shopify_cursor_missing");
    }
    await updateResourceCursor({
      shopId: input.shopId,
      resourceType: "COMPANIES",
      cursor: nextCursor,
      completed: !connection.pageInfo.hasNextPage,
      watermark: input.observedAt,
    });
    cursor = nextCursor;
  } while (cursor);
}

async function synchronizeOrders(
  admin: GraphqlAdmin,
  input: {
    shopId: string;
    timezone: string;
    observedAt: Date;
    correlationId: string;
  },
): Promise<void> {
  const state = await prepareResourceCursor(
    input.shopId,
    "ORDERS",
    input.observedAt,
  );
  if (state.completed) return;
  let cursor = state.cursor;
  do {
    const data: {
      orders?: {
        pageInfo: PageInfo;
        nodes: OrderNode[];
      };
    } = await queryAdmin(admin, RECEIVABLE_ORDERS_PAGE_CONTRACT_QUERY, {
      first: ORDER_PAGE_SIZE,
      after: cursor,
      query: ORDER_SEARCH_QUERY,
    });
    const connection = data.orders;
    if (!connection) throw new Error("orders_connection_missing");
    const nextCursor = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor ?? null
      : null;
    if (connection.pageInfo.hasNextPage && !nextCursor) {
      throw new Error("shopify_cursor_missing");
    }
    await prisma.$transaction(async (transaction) => {
      await projectOrders(transaction, {
        ...input,
        nodes: connection.nodes,
      });
      await transaction.reconciliationCursor.update({
        where: {
          shopId_resourceType: {
            shopId: input.shopId,
            resourceType: "ORDERS",
          },
        },
        data: {
          cursor: nextCursor,
          state: connection.pageInfo.hasNextPage
            ? "PROCESSING"
            : "COMPLETED",
          lastSuccessAt: new Date(),
          lastFullSweepAt: connection.pageInfo.hasNextPage
            ? undefined
            : input.observedAt,
          errorCode: null,
        },
      });
    });
    cursor = nextCursor;
  } while (cursor);
}

export async function reconcileFullProjection(input: {
  shopId: string;
  shopDomain: string;
  kind: SyncWorkKind;
  correlationId: string;
}): Promise<void> {
  const { admin } = await unauthenticated.admin(input.shopDomain);
  const timezone = await verifyInstallation(admin, input);
  const observedAt = await startSweep(input.shopId, input.kind);
  await synchronizeCompanies(admin, {
    shopId: input.shopId,
    observedAt,
    correlationId: input.correlationId,
  });
  await synchronizeOrders(admin, {
    shopId: input.shopId,
    timezone,
    observedAt,
    correlationId: input.correlationId,
  });
  await prisma.$transaction(async (transaction) => {
    const mismatchCount = await repairProjectionDrift(transaction, {
      shopId: input.shopId,
      sweepStartedAt: observedAt,
      correlationId: input.correlationId,
    });
    await transaction.reconciliationCursor.update({
      where: {
        shopId_resourceType: {
          shopId: input.shopId,
          resourceType: "FULL_SYNC",
        },
      },
      data: {
        state: "COMPLETED",
        cursor: null,
        mismatchCount,
        lastSuccessAt: new Date(),
        lastFullSweepAt: observedAt,
        errorCode: null,
      },
    });
    await transaction.shop.update({
      where: { id: input.shopId },
      data: {
        syncStatus: "FRESH",
        lastReconciledAt: new Date(),
      },
    });
  });
}

export async function refreshOrderProjection(input: {
  shopId: string;
  shopDomain: string;
  timezone: string;
  orderGid: string;
  correlationId: string;
}): Promise<void> {
  const { admin } = await unauthenticated.admin(input.shopDomain);
  const data = await queryAdmin<{ order?: OrderNode | null }>(
    admin,
    RECEIVABLE_ORDER_CONTRACT_QUERY,
    { id: input.orderGid },
  );
  if (!data.order) return;
  await prisma.$transaction((transaction) =>
    projectOrders(transaction, {
      shopId: input.shopId,
      timezone: input.timezone,
      nodes: [data.order!],
      observedAt: new Date(),
      correlationId: input.correlationId,
    }),
  );
}

export async function failActiveReconciliationCursors(
  shopId: string,
  errorCode: string,
): Promise<void> {
  await prisma.reconciliationCursor.updateMany({
    where: { shopId, state: "PROCESSING" },
    data: { state: "FAILED", errorCode },
  });
}

import { randomUUID } from "node:crypto";

import {
  Prisma,
  type CollectionNoteType,
  type PromiseToPayStatus,
} from "@prisma/client";

import prisma from "../../db.server";
import { AuditRepository } from "../../operations/audit-repository.server";
import { decryptSessionSecret, encryptSessionSecret } from "../../platform/security/encryption.server";
import { InactiveShopError, ShopRepository } from "../../tenancy/shop-repository.server";
import { buildDailyCollectionQueue, buildReliabilityFacts } from "./collections";

type DatabaseClient = Prisma.TransactionClient;

export class CollectionInputError extends Error {}

type Actor = { id: string | null; correlationId: string };

function noteContext(shopId: string): string {
  return `collections:${shopId}:notes`;
}

function promiseContext(shopId: string): string {
  return `collections:${shopId}:promises`;
}

function decrypted(value: string | null, context: string): string | null {
  return value ? decryptSessionSecret(value, context) : null;
}

async function requireActiveShopByDomain(shopDomain: string) {
  const shop = await new ShopRepository(prisma).findByDomain(shopDomain);
  if (!shop || shop.status !== "ACTIVE") throw new InactiveShopError();
  return shop;
}

async function findReceivable(
  transaction: DatabaseClient,
  shopId: string,
  receivableId: string,
) {
  const receivable = await transaction.receivable.findFirst({
    where: { id: receivableId, shopId },
    select: { id: true, companyId: true, currency: true, status: true, outstandingAmount: true },
  });
  if (!receivable) throw new CollectionInputError("Receivable was not found");
  return receivable;
}

async function appendAction(
  transaction: DatabaseClient,
  input: {
    shopId: string;
    companyId: string | null;
    receivableId: string | null;
    noteId?: string;
    promiseId?: string;
    type:
      | "NOTE_CREATED"
      | "PROMISE_CREATED"
      | "PROMISE_FULFILLED"
      | "PROMISE_BROKEN"
      | "PROMISE_CANCELED"
      | "PROMISE_SUPERSEDED"
      | "SNOOZED"
      | "DAILY_DISMISSED";
    safeSummary: string;
    actor: Actor;
    effectiveAt?: Date;
  },
) {
  return transaction.collectionAction.create({
    data: {
      shopId: input.shopId,
      companyId: input.companyId,
      receivableId: input.receivableId,
      noteId: input.noteId,
      promiseId: input.promiseId,
      type: input.type,
      safeSummary: input.safeSummary,
      actorId: input.actor.id ?? undefined,
      effectiveAt: input.effectiveAt,
    },
  });
}

async function appendAudit(
  transaction: DatabaseClient,
  shopId: string,
  actor: Actor,
  action: string,
  targetType: string,
  targetId: string,
  safeAfter: Prisma.InputJsonValue,
) {
  await new AuditRepository(transaction, shopId).append({
    actorType: "MERCHANT",
    actorId: actor.id ?? undefined,
    action,
    targetType,
    targetId,
    safeAfter,
    correlationId: actor.correlationId,
  });
}

export async function loadCollectionsQueue(shopDomain: string) {
  const shop = await requireActiveShopByDomain(shopDomain);
  const now = new Date();
  const receivables = await prisma.receivable.findMany({
    where: {
      shopId: shop.id,
      status: "OPEN",
      outstandingAmount: { gt: 0 },
      dueAt: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      orderName: true,
      outstandingAmount: true,
      currency: true,
      dueAt: true,
      company: { select: { displayName: true } },
      promisesToPay: { where: { status: "OPEN" }, select: { promisedAt: true, status: true } },
      collectionActions: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { type: true, createdAt: true, effectiveAt: true },
      },
    },
  });
  const queue = buildDailyCollectionQueue({
    now,
    timezone: shop.timezone,
    candidates: receivables.flatMap((receivable) =>
      receivable.dueAt
        ? [{
            id: receivable.id,
            companyId: receivable.companyId,
            companyName: receivable.company?.displayName ?? null,
            orderName: receivable.orderName,
            outstandingAmount: receivable.outstandingAmount.toString(),
            currency: receivable.currency,
            dueAt: receivable.dueAt,
            promises: receivable.promisesToPay,
            actions: receivable.collectionActions,
          }]
        : [],
    ),
  });

  return {
    queue,
    generatedAt: now.toISOString(),
    syncStatus: shop.syncStatus,
    lastReconciledAt: shop.lastReconciledAt?.toISOString() ?? null,
  };
}

export async function loadCompanyCollectionHistory(
  shopDomain: string,
  companyId: string,
) {
  const shop = await requireActiveShopByDomain(shopDomain);
  const company = await prisma.company.findFirst({
    where: { id: companyId, shopId: shop.id },
    select: {
      id: true,
      displayName: true,
      receivables: {
        where: { shopId: shop.id },
        orderBy: [{ dueAt: "asc" }, { orderName: "asc" }],
        select: {
          id: true,
          orderName: true,
          status: true,
          outstandingAmount: true,
          currency: true,
          dueAt: true,
          transitions: {
            where: { shopId: shop.id, currentStatus: "PAID" },
            orderBy: { sourceOccurredAt: "desc" },
            take: 1,
            select: { sourceOccurredAt: true, createdAt: true },
          },
        },
      },
      collectionNotes: {
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, type: true, encryptedBody: true, effectiveAt: true, createdAt: true },
      },
      collectionActions: {
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, type: true, safeSummary: true, effectiveAt: true, createdAt: true, receivableId: true },
      },
      promisesToPay: {
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, receivableId: true, status: true, promisedAt: true, promisedAmount: true, currency: true, encryptedNote: true, createdAt: true },
      },
      reminderSuppressions: {
        where: {
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true, reasonCode: true },
        take: 1,
      },
    },
  });
  if (!company) return null;

  const reliability = buildReliabilityFacts({
    timezone: shop.timezone,
    paidInvoices: company.receivables.flatMap((receivable) => {
      const transition = receivable.transitions[0];
      return receivable.status === "PAID" && receivable.dueAt && transition
        ? [{ dueAt: receivable.dueAt, paidAt: transition.sourceOccurredAt ?? transition.createdAt }]
        : [];
    }),
    brokenPromiseCount: company.promisesToPay.filter((promise) => promise.status === "BROKEN").length,
  });

  return {
    id: company.id,
    displayName: company.displayName,
    receivables: company.receivables.map((item) => ({
      id: item.id,
      orderName: item.orderName,
      status: item.status,
      outstandingAmount: item.outstandingAmount.toString(),
      currency: item.currency,
      dueAt: item.dueAt?.toISOString() ?? null,
    })),
    notes: company.collectionNotes.map((note) => ({
      id: note.id,
      type: note.type,
      body: decrypted(note.encryptedBody, noteContext(shop.id)),
      effectiveAt: note.effectiveAt?.toISOString() ?? null,
      createdAt: note.createdAt.toISOString(),
    })),
    actions: company.collectionActions.map((action) => ({
      id: action.id,
      type: action.type,
      safeSummary: action.safeSummary,
      effectiveAt: action.effectiveAt?.toISOString() ?? null,
      createdAt: action.createdAt.toISOString(),
      receivableId: action.receivableId,
    })),
    promises: company.promisesToPay.map((promise) => ({
      id: promise.id,
      receivableId: promise.receivableId,
      status: promise.status,
      promisedAt: promise.promisedAt.toISOString(),
      promisedAmount: promise.promisedAmount?.toString() ?? null,
      currency: promise.currency,
      note: decrypted(promise.encryptedNote, promiseContext(shop.id)),
      createdAt: promise.createdAt.toISOString(),
    })),
    remindersSuppressed: company.reminderSuppressions.length > 0,
    reliability,
  };
}

export async function loadReceivableCollectionHistory(
  shopDomain: string,
  receivableId: string,
) {
  const shop = await requireActiveShopByDomain(shopDomain);
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, shopId: shop.id },
    select: {
      id: true,
      company: { select: { id: true, displayName: true } },
      orderName: true,
      outstandingAmount: true,
      currency: true,
      dueAt: true,
      status: true,
      collectionNotes: { orderBy: { createdAt: "desc" }, select: { id: true, type: true, encryptedBody: true, createdAt: true } },
      collectionActions: { orderBy: { createdAt: "desc" }, select: { id: true, type: true, safeSummary: true, effectiveAt: true, createdAt: true } },
      promisesToPay: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, promisedAt: true, promisedAmount: true, currency: true, encryptedNote: true, createdAt: true } },
    },
  });
  if (!receivable) return null;
  return {
    id: receivable.id,
    company: receivable.company,
    orderName: receivable.orderName,
    outstandingAmount: receivable.outstandingAmount.toString(),
    currency: receivable.currency,
    dueAt: receivable.dueAt?.toISOString() ?? null,
    status: receivable.status,
    notes: receivable.collectionNotes.map((note) => ({ id: note.id, type: note.type, body: decrypted(note.encryptedBody, noteContext(shop.id)), createdAt: note.createdAt.toISOString() })),
    actions: receivable.collectionActions.map((action) => ({ id: action.id, type: action.type, safeSummary: action.safeSummary, effectiveAt: action.effectiveAt?.toISOString() ?? null, createdAt: action.createdAt.toISOString() })),
    promises: receivable.promisesToPay.map((promise) => ({ id: promise.id, status: promise.status, promisedAt: promise.promisedAt.toISOString(), promisedAmount: promise.promisedAmount?.toString() ?? null, currency: promise.currency, note: decrypted(promise.encryptedNote, promiseContext(shop.id)), createdAt: promise.createdAt.toISOString() })),
  };
}

export async function recordCollectionNote(input: {
  shopDomain: string;
  companyId?: string;
  receivableId?: string;
  type: CollectionNoteType;
  body: string;
  effectiveAt?: Date;
  actor: Actor;
}) {
  const shop = await requireActiveShopByDomain(input.shopDomain);
  const body = input.body.trim();
  if (!body || body.length > 4_000) throw new CollectionInputError("A note of up to 4,000 characters is required");
  if (!input.companyId && !input.receivableId) throw new CollectionInputError("A company or receivable is required");

  await prisma.$transaction(async (transaction) => {
    const receivable = input.receivableId
      ? await findReceivable(transaction, shop.id, input.receivableId)
      : null;
    const companyId = input.companyId ?? receivable?.companyId ?? null;
    if (input.companyId) {
      const company = await transaction.company.findFirst({ where: { id: input.companyId, shopId: shop.id }, select: { id: true } });
      if (!company || (receivable?.companyId && receivable.companyId !== company.id)) throw new CollectionInputError("Company was not found");
    }
    const id = randomUUID();
    const note = await transaction.collectionNote.create({
      data: {
        id,
        shopId: shop.id,
        companyId,
        receivableId: receivable?.id,
        type: input.type,
        encryptedBody: encryptSessionSecret(body, noteContext(shop.id)),
        actorId: input.actor.id ?? undefined,
        effectiveAt: input.effectiveAt,
      },
    });
    await appendAction(transaction, { shopId: shop.id, companyId, receivableId: receivable?.id ?? null, noteId: note.id, type: "NOTE_CREATED", safeSummary: input.type === "EXTERNAL_PAYMENT" ? "Non-authoritative external payment note recorded" : "Internal collection note recorded", actor: input.actor, effectiveAt: input.effectiveAt });
    await appendAudit(transaction, shop.id, input.actor, "collection.note_recorded", "collection_note", note.id, { type: input.type, companyId, receivableId: receivable?.id ?? null, nonAuthoritative: input.type === "EXTERNAL_PAYMENT" });
  });
}

export async function recordPromiseToPay(input: {
  shopDomain: string;
  receivableId: string;
  promisedAt: Date;
  promisedAmount?: string;
  note?: string;
  actor: Actor;
}) {
  const shop = await requireActiveShopByDomain(input.shopDomain);
  if (Number.isNaN(input.promisedAt.valueOf())) throw new CollectionInputError("A valid promised date is required");
  if (input.note && input.note.length > 4_000) throw new CollectionInputError("Promise note is too long");
  const amount = input.promisedAmount ? new Prisma.Decimal(input.promisedAmount) : null;
  if (amount?.isNegative() || amount?.isZero()) throw new CollectionInputError("Promise amount must be positive");

  await prisma.$transaction(async (transaction) => {
    const receivable = await findReceivable(transaction, shop.id, input.receivableId);
    if (receivable.status !== "OPEN" || new Prisma.Decimal(receivable.outstandingAmount).lessThanOrEqualTo(0)) {
      throw new CollectionInputError("Only an open positive Shopify receivable can have a promise");
    }
    const id = randomUUID();
    const promise = await transaction.promiseToPay.create({
      data: {
        id,
        shopId: shop.id,
        companyId: receivable.companyId,
        receivableId: receivable.id,
        promisedAt: input.promisedAt,
        promisedAmount: amount,
        currency: amount ? receivable.currency : null,
        encryptedNote: input.note?.trim() ? encryptSessionSecret(input.note.trim(), promiseContext(shop.id)) : undefined,
        creatorId: input.actor.id ?? undefined,
      },
    });
    const superseded = await transaction.promiseToPay.updateMany({
      where: { shopId: shop.id, receivableId: receivable.id, status: "OPEN", id: { not: promise.id } },
      data: { status: "SUPERSEDED", supersededAt: new Date(), supersededById: promise.id },
    });
    if (superseded.count > 0) {
      await appendAction(transaction, { shopId: shop.id, companyId: receivable.companyId, receivableId: receivable.id, promiseId: promise.id, type: "PROMISE_SUPERSEDED", safeSummary: "Previous open promise superseded", actor: input.actor });
    }
    await appendAction(transaction, { shopId: shop.id, companyId: receivable.companyId, receivableId: receivable.id, promiseId: promise.id, type: "PROMISE_CREATED", safeSummary: "Promise to pay recorded", actor: input.actor, effectiveAt: input.promisedAt });
    await appendAudit(transaction, shop.id, input.actor, "collection.promise_recorded", "promise_to_pay", promise.id, { receivableId: receivable.id, companyId: receivable.companyId, promisedAt: input.promisedAt.toISOString(), amountRecorded: Boolean(amount) });
  });
}

const promiseTransitions: Record<Exclude<PromiseToPayStatus, "OPEN" | "SUPERSEDED">, { action: "PROMISE_FULFILLED" | "PROMISE_BROKEN" | "PROMISE_CANCELED"; summary: string }> = {
  FULFILLED: { action: "PROMISE_FULFILLED", summary: "Promise marked fulfilled" },
  BROKEN: { action: "PROMISE_BROKEN", summary: "Promise marked broken" },
  CANCELED: { action: "PROMISE_CANCELED", summary: "Promise canceled" },
};

export async function transitionPromiseToPay(input: {
  shopDomain: string;
  promiseId: string;
  status: Exclude<PromiseToPayStatus, "OPEN" | "SUPERSEDED">;
  actor: Actor;
}) {
  const shop = await requireActiveShopByDomain(input.shopDomain);
  const transition = promiseTransitions[input.status];
  await prisma.$transaction(async (transaction) => {
    const promise = await transaction.promiseToPay.findFirst({ where: { id: input.promiseId, shopId: shop.id }, select: { id: true, status: true, companyId: true, receivableId: true } });
    if (!promise || promise.status !== "OPEN") throw new CollectionInputError("Only an open promise can change state");
    const now = new Date();
    await transaction.promiseToPay.update({ where: { id: promise.id }, data: { status: input.status, ...(input.status === "FULFILLED" ? { fulfilledAt: now } : input.status === "BROKEN" ? { brokenAt: now } : { canceledAt: now }) } });
    await appendAction(transaction, { shopId: shop.id, companyId: promise.companyId, receivableId: promise.receivableId, promiseId: promise.id, type: transition.action, safeSummary: transition.summary, actor: input.actor });
    await appendAudit(transaction, shop.id, input.actor, "collection.promise_transitioned", "promise_to_pay", promise.id, { status: input.status });
  });
}

export async function snoozeReceivable(input: { shopDomain: string; receivableId: string; until: Date; actor: Actor }) {
  const shop = await requireActiveShopByDomain(input.shopDomain);
  if (Number.isNaN(input.until.valueOf()) || input.until <= new Date()) throw new CollectionInputError("Choose a future snooze date");
  await prisma.$transaction(async (transaction) => {
    const receivable = await findReceivable(transaction, shop.id, input.receivableId);
    const note = await transaction.collectionNote.create({ data: { id: randomUUID(), shopId: shop.id, companyId: receivable.companyId, receivableId: receivable.id, type: "SNOOZE_REASON", encryptedBody: encryptSessionSecret("Snoozed from collections queue", noteContext(shop.id)), actorId: input.actor.id ?? undefined, effectiveAt: input.until } });
    await appendAction(transaction, { shopId: shop.id, companyId: receivable.companyId, receivableId: receivable.id, noteId: note.id, type: "SNOOZED", safeSummary: "Receivable snoozed", actor: input.actor, effectiveAt: input.until });
    await appendAudit(transaction, shop.id, input.actor, "collection.receivable_snoozed", "receivable", receivable.id, { until: input.until.toISOString() });
  });
}

export async function dismissReceivableForDay(input: { shopDomain: string; receivableId: string; actor: Actor }) {
  const shop = await requireActiveShopByDomain(input.shopDomain);
  await prisma.$transaction(async (transaction) => {
    const receivable = await findReceivable(transaction, shop.id, input.receivableId);
    await appendAction(transaction, { shopId: shop.id, companyId: receivable.companyId, receivableId: receivable.id, type: "DAILY_DISMISSED", safeSummary: "Dismissed from today’s queue", actor: input.actor });
    await appendAudit(transaction, shop.id, input.actor, "collection.receivable_dismissed", "receivable", receivable.id, { scope: "daily_queue" });
  });
}

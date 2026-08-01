-- D4: app-owned collections workflow records. Shopify remains authoritative for balances.
CREATE TYPE "CollectionNoteType" AS ENUM ('INTERNAL', 'EXTERNAL_PAYMENT', 'DISPUTE', 'SNOOZE_REASON');
CREATE TYPE "PromiseToPayStatus" AS ENUM ('OPEN', 'FULFILLED', 'BROKEN', 'CANCELED', 'SUPERSEDED');
CREATE TYPE "CollectionActionType" AS ENUM (
  'NOTE_CREATED', 'PROMISE_CREATED', 'PROMISE_FULFILLED', 'PROMISE_BROKEN',
  'PROMISE_CANCELED', 'PROMISE_SUPERSEDED', 'SNOOZED', 'DAILY_DISMISSED'
);

CREATE TABLE "collection_notes" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "companyId" TEXT,
  "receivableId" TEXT,
  "type" "CollectionNoteType" NOT NULL,
  "encryptedBody" TEXT NOT NULL,
  "actorId" TEXT,
  "effectiveAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "collection_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_notes_target_check" CHECK ("companyId" IS NOT NULL OR "receivableId" IS NOT NULL)
);

CREATE TABLE "promises_to_pay" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "companyId" TEXT,
  "receivableId" TEXT NOT NULL,
  "promisedAt" TIMESTAMPTZ NOT NULL,
  "promisedAmount" DECIMAL(20,4),
  "currency" TEXT,
  "encryptedNote" TEXT,
  "status" "PromiseToPayStatus" NOT NULL DEFAULT 'OPEN',
  "creatorId" TEXT,
  "fulfilledAt" TIMESTAMPTZ,
  "brokenAt" TIMESTAMPTZ,
  "canceledAt" TIMESTAMPTZ,
  "supersededAt" TIMESTAMPTZ,
  "supersededById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "promises_to_pay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promises_to_pay_amount_currency_check" CHECK (("promisedAmount" IS NULL AND "currency" IS NULL) OR ("promisedAmount" IS NOT NULL AND "currency" IS NOT NULL))
);

CREATE TABLE "collection_actions" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "companyId" TEXT,
  "receivableId" TEXT,
  "noteId" TEXT,
  "promiseId" TEXT,
  "type" "CollectionActionType" NOT NULL,
  "safeSummary" TEXT NOT NULL,
  "actorId" TEXT,
  "effectiveAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reliability_snapshots" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "eligibleInvoiceCount" INTEGER NOT NULL,
  "paidLateCount" INTEGER NOT NULL,
  "medianDaysLate" INTEGER,
  "averageDaysLate" DECIMAL(10,2),
  "brokenPromiseCount" INTEGER NOT NULL,
  "calculationWindow" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  "calculatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reliability_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promises_to_pay" ADD CONSTRAINT "promises_to_pay_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promises_to_pay" ADD CONSTRAINT "promises_to_pay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promises_to_pay" ADD CONSTRAINT "promises_to_pay_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promises_to_pay" ADD CONSTRAINT "promises_to_pay_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "promises_to_pay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "collection_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_promiseId_fkey" FOREIGN KEY ("promiseId") REFERENCES "promises_to_pay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reliability_snapshots" ADD CONSTRAINT "reliability_snapshots_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reliability_snapshots" ADD CONSTRAINT "reliability_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "collection_notes_shopId_companyId_createdAt_idx" ON "collection_notes"("shopId", "companyId", "createdAt" DESC);
CREATE INDEX "collection_notes_shopId_receivableId_createdAt_idx" ON "collection_notes"("shopId", "receivableId", "createdAt" DESC);
CREATE INDEX "promises_to_pay_shopId_receivableId_status_promisedAt_idx" ON "promises_to_pay"("shopId", "receivableId", "status", "promisedAt");
CREATE INDEX "promises_to_pay_shopId_companyId_createdAt_idx" ON "promises_to_pay"("shopId", "companyId", "createdAt" DESC);
CREATE INDEX "collection_actions_shopId_companyId_createdAt_idx" ON "collection_actions"("shopId", "companyId", "createdAt" DESC);
CREATE INDEX "collection_actions_shopId_receivableId_createdAt_idx" ON "collection_actions"("shopId", "receivableId", "createdAt" DESC);
CREATE INDEX "reliability_snapshots_shopId_companyId_calculatedAt_idx" ON "reliability_snapshots"("shopId", "companyId", "calculatedAt" DESC);

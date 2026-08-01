-- D2: Shopify projection, durable webhook receipt/outbox, and reconciliation cursors.
CREATE TYPE "ProjectionStatus" AS ENUM ('ACTIVE', 'DELETED', 'REDACTED');
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PAID', 'CANCELED', 'REFUNDED', 'CLOSED');
CREATE TYPE "WebhookReceiptState" AS ENUM ('QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED');
CREATE TYPE "SyncWorkKind" AS ENUM ('INITIAL', 'WEBHOOK_REFRESH', 'RECONCILIATION', 'MANUAL_RETRY');
CREATE TYPE "SyncWorkState" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "companies" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "shopifyCompanyGid" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "status" "ProjectionStatus" NOT NULL DEFAULT 'ACTIVE', "shopifyUpdatedAt" TIMESTAMP(3), "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "company_locations" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "shopifyLocationGid" TEXT NOT NULL, "displayLabel" TEXT,
  "status" "ProjectionStatus" NOT NULL DEFAULT 'ACTIVE', "shopifyUpdatedAt" TIMESTAMP(3), "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "company_contacts" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "companyLocationId" TEXT, "shopifyContactGid" TEXT NOT NULL, "shopifyCustomerGid" TEXT,
  "encryptedEmail" TEXT, "emailHmac" TEXT, "emailValid" BOOLEAN NOT NULL DEFAULT false, "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" "ProjectionStatus" NOT NULL DEFAULT 'ACTIVE', "shopifyUpdatedAt" TIMESTAMP(3), "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redactedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "receivables" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "shopifyOrderGid" TEXT NOT NULL, "companyId" TEXT, "companyLocationId" TEXT, "orderName" TEXT NOT NULL,
  "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN', "originalTotal" DECIMAL(20,4) NOT NULL, "outstandingAmount" DECIMAL(20,4) NOT NULL, "currency" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3), "dueAt" TIMESTAMP(3), "paymentTermsType" TEXT, "shopifyUpdatedAt" TIMESTAMP(3), "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payment_schedules" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "receivableId" TEXT NOT NULL, "shopifyScheduleGid" TEXT NOT NULL,
  "balanceDue" DECIMAL(20,4) NOT NULL, "totalBalance" DECIMAL(20,4) NOT NULL, "currency" TEXT NOT NULL, "dueAt" TIMESTAMP(3), "issuedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "shopifyUpdatedAt" TIMESTAMP(3), "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "receivable_state_transitions" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "receivableId" TEXT NOT NULL, "previousStatus" "ReceivableStatus", "currentStatus" "ReceivableStatus" NOT NULL,
  "previousBalance" DECIMAL(20,4), "currentBalance" DECIMAL(20,4) NOT NULL, "reason" TEXT NOT NULL, "sourceOccurredAt" TIMESTAMP(3), "correlationId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivable_state_transitions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "webhook_receipts" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "provider" TEXT NOT NULL, "externalReceiptId" TEXT NOT NULL, "eventId" TEXT, "topic" TEXT NOT NULL, "apiVersion" TEXT,
  "sourceOccurredAt" TIMESTAMP(3), "payloadHash" TEXT NOT NULL, "state" "WebhookReceiptState" NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3), "errorCode" TEXT, "correlationId" TEXT NOT NULL,
  CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "sync_work_items" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "receiptId" TEXT, "kind" "SyncWorkKind" NOT NULL, "resourceType" TEXT NOT NULL, "resourceGid" TEXT,
  "state" "SyncWorkState" NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "errorCode" TEXT, "correlationId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_work_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "reconciliation_cursors" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "resourceType" TEXT NOT NULL, "cursor" TEXT, "watermark" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "lastFullSweepAt" TIMESTAMP(3),
  "state" "SyncWorkState" NOT NULL DEFAULT 'QUEUED', "mismatchCount" INTEGER NOT NULL DEFAULT 0, "errorCode" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reconciliation_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_shopId_shopifyCompanyGid_key" ON "companies"("shopId", "shopifyCompanyGid");
CREATE INDEX "companies_shopId_status_idx" ON "companies"("shopId", "status");
CREATE UNIQUE INDEX "company_locations_shopId_shopifyLocationGid_key" ON "company_locations"("shopId", "shopifyLocationGid");
CREATE INDEX "company_locations_shopId_companyId_idx" ON "company_locations"("shopId", "companyId");
CREATE UNIQUE INDEX "company_contacts_shopId_shopifyContactGid_key" ON "company_contacts"("shopId", "shopifyContactGid");
CREATE INDEX "company_contacts_shopId_companyId_idx" ON "company_contacts"("shopId", "companyId");
CREATE INDEX "company_contacts_shopId_emailHmac_idx" ON "company_contacts"("shopId", "emailHmac");
CREATE UNIQUE INDEX "receivables_shopId_shopifyOrderGid_key" ON "receivables"("shopId", "shopifyOrderGid");
CREATE INDEX "receivables_shopId_status_dueAt_idx" ON "receivables"("shopId", "status", "dueAt");
CREATE UNIQUE INDEX "payment_schedules_shopId_shopifyScheduleGid_key" ON "payment_schedules"("shopId", "shopifyScheduleGid");
CREATE INDEX "payment_schedules_shopId_receivableId_idx" ON "payment_schedules"("shopId", "receivableId");
CREATE INDEX "receivable_state_transitions_shopId_receivableId_createdAt_idx" ON "receivable_state_transitions"("shopId", "receivableId", "createdAt");
CREATE UNIQUE INDEX "webhook_receipts_provider_shopId_externalReceiptId_key" ON "webhook_receipts"("provider", "shopId", "externalReceiptId");
CREATE INDEX "webhook_receipts_shopId_state_receivedAt_idx" ON "webhook_receipts"("shopId", "state", "receivedAt");
CREATE INDEX "sync_work_items_shopId_state_availableAt_idx" ON "sync_work_items"("shopId", "state", "availableAt");
CREATE INDEX "sync_work_items_receiptId_idx" ON "sync_work_items"("receiptId");
CREATE UNIQUE INDEX "reconciliation_cursors_shopId_resourceType_key" ON "reconciliation_cursors"("shopId", "resourceType");

ALTER TABLE "companies" ADD CONSTRAINT "companies_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "company_locations"("id") ON DELETE SET NULL;
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE;
ALTER TABLE "receivable_state_transitions" ADD CONSTRAINT "receivable_state_transitions_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE;
ALTER TABLE "webhook_receipts" ADD CONSTRAINT "webhook_receipts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "sync_work_items" ADD CONSTRAINT "sync_work_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "sync_work_items" ADD CONSTRAINT "sync_work_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "webhook_receipts"("id") ON DELETE SET NULL;
ALTER TABLE "reconciliation_cursors" ADD CONSTRAINT "reconciliation_cursors_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;

-- Prisma cannot express composite tenant foreign keys where the referenced
-- entity also has a surrogate primary key. These guards make cross-shop child
-- references impossible at the database boundary.
CREATE FUNCTION "enforce_projection_tenant_scope"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'company_locations' AND NOT EXISTS (
    SELECT 1 FROM "companies" WHERE "id" = NEW."companyId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'company location tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'company_contacts' AND NOT EXISTS (
    SELECT 1 FROM "companies" WHERE "id" = NEW."companyId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'company contact tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'receivables' AND NEW."companyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "companies" WHERE "id" = NEW."companyId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'receivable company tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'receivables' AND NEW."companyLocationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "company_locations" WHERE "id" = NEW."companyLocationId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'receivable location tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'payment_schedules' AND NOT EXISTS (
    SELECT 1 FROM "receivables" WHERE "id" = NEW."receivableId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'payment schedule tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'receivable_state_transitions' AND NOT EXISTS (
    SELECT 1 FROM "receivables" WHERE "id" = NEW."receivableId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'receivable transition tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'sync_work_items' AND NEW."receiptId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "webhook_receipts" WHERE "id" = NEW."receiptId" AND "shopId" = NEW."shopId"
  ) THEN RAISE EXCEPTION 'sync work receipt tenant mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "company_locations_tenant_scope" BEFORE INSERT OR UPDATE ON "company_locations" FOR EACH ROW EXECUTE FUNCTION "enforce_projection_tenant_scope"();
CREATE TRIGGER "company_contacts_tenant_scope" BEFORE INSERT OR UPDATE ON "company_contacts" FOR EACH ROW EXECUTE FUNCTION "enforce_projection_tenant_scope"();
CREATE TRIGGER "receivables_tenant_scope" BEFORE INSERT OR UPDATE ON "receivables" FOR EACH ROW EXECUTE FUNCTION "enforce_projection_tenant_scope"();
CREATE TRIGGER "payment_schedules_tenant_scope" BEFORE INSERT OR UPDATE ON "payment_schedules" FOR EACH ROW EXECUTE FUNCTION "enforce_projection_tenant_scope"();
CREATE TRIGGER "receivable_state_transitions_tenant_scope" BEFORE INSERT OR UPDATE ON "receivable_state_transitions" FOR EACH ROW EXECUTE FUNCTION "enforce_projection_tenant_scope"();
CREATE TRIGGER "sync_work_items_tenant_scope" BEFORE INSERT OR UPDATE ON "sync_work_items" FOR EACH ROW EXECUTE FUNCTION "enforce_projection_tenant_scope"();

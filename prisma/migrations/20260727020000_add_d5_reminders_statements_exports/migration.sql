-- D5: immutable reminder policies, at-most-once deliveries, suppressions,
-- provider events, and statement evidence.
CREATE TYPE "ReminderPolicyState" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "ReplyToVerificationState" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');
CREATE TYPE "ReminderDeliveryState" AS ENUM (
  'RESERVED', 'VALIDATING', 'SENDING', 'UNKNOWN', 'ACCEPTED', 'DELIVERED',
  'DEFERRED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED', 'CANCELED'
);
CREATE TYPE "SuppressionSource" AS ENUM ('MERCHANT', 'BOUNCE', 'COMPLAINT', 'PROVIDER', 'PRIVACY');
CREATE TYPE "StatementRunState" AS ENUM ('READY', 'FAILED');

ALTER TYPE "CollectionActionType" ADD VALUE 'REMINDER_SENT';
ALTER TYPE "CollectionActionType" ADD VALUE 'STATEMENT_GENERATED';
ALTER TYPE "CollectionActionType" ADD VALUE 'SUPPRESSION_CHANGED';

CREATE TABLE "reply_to_verifications" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "state" "ReplyToVerificationState" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "verifiedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reply_to_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_policies" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "state" "ReminderPolicyState" NOT NULL DEFAULT 'DRAFT',
  "timezone" TEXT NOT NULL,
  "activeVersionId" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reminder_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_policy_versions" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reminderPolicyId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "senderDisplayName" TEXT NOT NULL,
  "replyToVerificationId" TEXT NOT NULL,
  "minimumOutstanding" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "previewedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_policy_stages" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reminderPolicyVersionId" TEXT NOT NULL,
  "stageKey" TEXT NOT NULL,
  "offsetDays" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "subjectTemplate" TEXT NOT NULL,
  "encryptedBodyTemplate" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_policy_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_deliveries" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "companyContactId" TEXT NOT NULL,
  "reminderPolicyVersionId" TEXT NOT NULL,
  "reminderPolicyStageId" TEXT NOT NULL,
  "reservationKey" TEXT NOT NULL,
  "state" "ReminderDeliveryState" NOT NULL DEFAULT 'RESERVED',
  "encryptedRecipient" TEXT,
  "encryptedSubject" TEXT,
  "encryptedBody" TEXT,
  "providerMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "eligibilityEvidenceHash" TEXT,
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  "reservedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMPTZ,
  "finalAt" TIMESTAMPTZ,
  "errorClass" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipient_suppressions" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "emailHmac" TEXT NOT NULL,
  "companyContactId" TEXT,
  "companyId" TEXT,
  "source" "SuppressionSource" NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "activeAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ,
  "releasedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "recipient_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_reminder_suppressions" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "activeAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ,
  "releasedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "company_reminder_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_provider_events" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reminderDeliveryId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerAt" TIMESTAMPTZ,
  "diagnosticCode" TEXT,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ,
  CONSTRAINT "email_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "statement_runs" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "state" "StatementRunState" NOT NULL DEFAULT 'READY',
  "asOf" TIMESTAMPTZ NOT NULL,
  "currencySet" TEXT[],
  "includedReceivableIds" TEXT[],
  "contentHash" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "statement_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reply_to_verifications_shopId_email_key" ON "reply_to_verifications"("shopId", "email");
CREATE INDEX "reply_to_verifications_shopId_state_expiresAt_idx" ON "reply_to_verifications"("shopId", "state", "expiresAt");
CREATE UNIQUE INDEX "reminder_policies_activeVersionId_key" ON "reminder_policies"("activeVersionId");
CREATE INDEX "reminder_policies_shopId_state_idx" ON "reminder_policies"("shopId", "state");
CREATE UNIQUE INDEX "reminder_policy_versions_shopId_reminderPolicyId_versionNumber_key" ON "reminder_policy_versions"("shopId", "reminderPolicyId", "versionNumber");
CREATE INDEX "reminder_policy_versions_shopId_reminderPolicyId_idx" ON "reminder_policy_versions"("shopId", "reminderPolicyId");
CREATE UNIQUE INDEX "reminder_policy_stages_shopId_reminderPolicyVersionId_stageKey_key" ON "reminder_policy_stages"("shopId", "reminderPolicyVersionId", "stageKey");
CREATE INDEX "reminder_policy_stages_shopId_enabled_offsetDays_idx" ON "reminder_policy_stages"("shopId", "enabled", "offsetDays");
CREATE UNIQUE INDEX "reminder_deliveries_shopId_receivableId_version_stage_key" ON "reminder_deliveries"("shopId", "receivableId", "reminderPolicyVersionId", "reminderPolicyStageId");
CREATE UNIQUE INDEX "reminder_deliveries_shopId_reservationKey_key" ON "reminder_deliveries"("shopId", "reservationKey");
CREATE UNIQUE INDEX "reminder_deliveries_providerMessageId_key" ON "reminder_deliveries"("providerMessageId");
CREATE INDEX "reminder_deliveries_shopId_state_scheduledAt_idx" ON "reminder_deliveries"("shopId", "state", "scheduledAt");
CREATE INDEX "recipient_suppressions_shopId_emailHmac_releasedAt_idx" ON "recipient_suppressions"("shopId", "emailHmac", "releasedAt");
CREATE UNIQUE INDEX "company_reminder_suppressions_shopId_companyId_key" ON "company_reminder_suppressions"("shopId", "companyId");
CREATE INDEX "company_reminder_suppressions_shopId_releasedAt_expiresAt_idx" ON "company_reminder_suppressions"("shopId", "releasedAt", "expiresAt");
CREATE UNIQUE INDEX "email_provider_events_shopId_providerEventId_key" ON "email_provider_events"("shopId", "providerEventId");
CREATE INDEX "email_provider_events_shopId_reminderDeliveryId_receivedAt_idx" ON "email_provider_events"("shopId", "reminderDeliveryId", "receivedAt");
CREATE INDEX "statement_runs_shopId_companyId_createdAt_idx" ON "statement_runs"("shopId", "companyId", "createdAt" DESC);

ALTER TABLE "reply_to_verifications" ADD CONSTRAINT "reply_to_verifications_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "reminder_policies" ADD CONSTRAINT "reminder_policies_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "reminder_policies" ADD CONSTRAINT "reminder_policies_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "reminder_policy_versions"("id") ON DELETE SET NULL;
ALTER TABLE "reminder_policy_versions" ADD CONSTRAINT "reminder_policy_versions_reminderPolicyId_fkey" FOREIGN KEY ("reminderPolicyId") REFERENCES "reminder_policies"("id") ON DELETE CASCADE;
ALTER TABLE "reminder_policy_versions" ADD CONSTRAINT "reminder_policy_versions_replyToVerificationId_fkey" FOREIGN KEY ("replyToVerificationId") REFERENCES "reply_to_verifications"("id") ON DELETE RESTRICT;
ALTER TABLE "reminder_policy_stages" ADD CONSTRAINT "reminder_policy_stages_reminderPolicyVersionId_fkey" FOREIGN KEY ("reminderPolicyVersionId") REFERENCES "reminder_policy_versions"("id") ON DELETE CASCADE;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_companyContactId_fkey" FOREIGN KEY ("companyContactId") REFERENCES "company_contacts"("id") ON DELETE RESTRICT;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminderPolicyVersionId_fkey" FOREIGN KEY ("reminderPolicyVersionId") REFERENCES "reminder_policy_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminderPolicyStageId_fkey" FOREIGN KEY ("reminderPolicyStageId") REFERENCES "reminder_policy_stages"("id") ON DELETE RESTRICT;
ALTER TABLE "recipient_suppressions" ADD CONSTRAINT "recipient_suppressions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "recipient_suppressions" ADD CONSTRAINT "recipient_suppressions_companyContactId_fkey" FOREIGN KEY ("companyContactId") REFERENCES "company_contacts"("id") ON DELETE SET NULL;
ALTER TABLE "recipient_suppressions" ADD CONSTRAINT "recipient_suppressions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL;
ALTER TABLE "company_reminder_suppressions" ADD CONSTRAINT "company_reminder_suppressions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "company_reminder_suppressions" ADD CONSTRAINT "company_reminder_suppressions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
ALTER TABLE "email_provider_events" ADD CONSTRAINT "email_provider_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "email_provider_events" ADD CONSTRAINT "email_provider_events_reminderDeliveryId_fkey" FOREIGN KEY ("reminderDeliveryId") REFERENCES "reminder_deliveries"("id") ON DELETE CASCADE;
ALTER TABLE "statement_runs" ADD CONSTRAINT "statement_runs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "statement_runs" ADD CONSTRAINT "statement_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_d5_tenant_scope"()
RETURNS TRIGGER AS $$
DECLARE row_data JSONB := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'reminder_policy_versions' AND NOT EXISTS (
    SELECT 1 FROM "reminder_policies" p WHERE p."id" = row_data->>'reminderPolicyId' AND p."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'reminder policy version tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'reminder_policy_versions' AND NOT EXISTS (
    SELECT 1 FROM "reply_to_verifications" v WHERE v."id" = row_data->>'replyToVerificationId' AND v."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'reply-to verification tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'reminder_policies' AND row_data->>'activeVersionId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "reminder_policy_versions" v
    WHERE v."id" = row_data->>'activeVersionId'
      AND v."shopId" = row_data->>'shopId'
      AND v."reminderPolicyId" = row_data->>'id'
  ) THEN RAISE EXCEPTION 'active reminder version tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'reminder_policy_stages' AND NOT EXISTS (
    SELECT 1 FROM "reminder_policy_versions" v WHERE v."id" = row_data->>'reminderPolicyVersionId' AND v."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'reminder stage tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'reminder_deliveries' AND (
    NOT EXISTS (SELECT 1 FROM "receivables" r WHERE r."id" = row_data->>'receivableId' AND r."shopId" = row_data->>'shopId')
    OR NOT EXISTS (SELECT 1 FROM "company_contacts" c WHERE c."id" = row_data->>'companyContactId' AND c."shopId" = row_data->>'shopId')
    OR NOT EXISTS (SELECT 1 FROM "reminder_policy_versions" v WHERE v."id" = row_data->>'reminderPolicyVersionId' AND v."shopId" = row_data->>'shopId')
    OR NOT EXISTS (SELECT 1 FROM "reminder_policy_stages" s WHERE s."id" = row_data->>'reminderPolicyStageId' AND s."shopId" = row_data->>'shopId')
  ) THEN RAISE EXCEPTION 'reminder delivery tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'statement_runs' AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'statement tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'company_reminder_suppressions' AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'company suppression tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'recipient_suppressions'
    AND row_data->>'companyId' IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId')
  THEN RAISE EXCEPTION 'recipient suppression company tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'recipient_suppressions'
    AND row_data->>'companyContactId' IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "company_contacts" c WHERE c."id" = row_data->>'companyContactId' AND c."shopId" = row_data->>'shopId')
  THEN RAISE EXCEPTION 'recipient suppression contact tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'email_provider_events' AND NOT EXISTS (
    SELECT 1 FROM "reminder_deliveries" d WHERE d."id" = row_data->>'reminderDeliveryId' AND d."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'provider event tenant mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reminder_policies_tenant_scope" BEFORE INSERT OR UPDATE ON "reminder_policies" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "reminder_policy_versions_tenant_scope" BEFORE INSERT OR UPDATE ON "reminder_policy_versions" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "reminder_policy_stages_tenant_scope" BEFORE INSERT OR UPDATE ON "reminder_policy_stages" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "reminder_deliveries_tenant_scope" BEFORE INSERT OR UPDATE ON "reminder_deliveries" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "statement_runs_tenant_scope" BEFORE INSERT OR UPDATE ON "statement_runs" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "company_reminder_suppressions_tenant_scope" BEFORE INSERT OR UPDATE ON "company_reminder_suppressions" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "recipient_suppressions_tenant_scope" BEFORE INSERT OR UPDATE ON "recipient_suppressions" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();
CREATE TRIGGER "email_provider_events_tenant_scope" BEFORE INSERT OR UPDATE ON "email_provider_events" FOR EACH ROW EXECUTE FUNCTION "enforce_d5_tenant_scope"();

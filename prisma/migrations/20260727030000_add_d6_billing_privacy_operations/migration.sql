-- D6: Shopify App Pricing snapshots, privacy lifecycle, restore-safe deletion
-- tombstones, onboarding state, and global/per-shop safety controls.
CREATE TYPE "EntitlementState" AS ENUM ('ACTIVE', 'FREE', 'FROZEN', 'CANCELED', 'UNKNOWN');
CREATE TYPE "PrivacyRequestType" AS ENUM ('CUSTOMER_DATA', 'CUSTOMER_REDACT', 'SHOP_REDACT', 'UNINSTALL_CLEANUP');
CREATE TYPE "PrivacyRequestState" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "SafetyControlKey" AS ENUM ('REMINDER_SENDS', 'SHOPIFY_IMPORTS', 'STATEMENTS', 'BILLING_CHANGES', 'PROVIDER_WEBHOOKS');

ALTER TABLE "shops" ADD COLUMN "onboardingCompletedAt" TIMESTAMPTZ;

CREATE TABLE "entitlement_snapshots" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "planHandle" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "state" "EntitlementState" NOT NULL,
  "limits" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "sourceObservedAt" TIMESTAMPTZ,
  "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entitlement_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "privacy_requests" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "externalRequestId" TEXT NOT NULL,
  "type" "PrivacyRequestType" NOT NULL,
  "state" "PrivacyRequestState" NOT NULL DEFAULT 'QUEUED',
  "subjectShopifyCustomerGid" TEXT,
  "subjectShopifyOrderGids" TEXT[],
  "dueAt" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "evidenceReference" TEXT,
  "errorCode" TEXT,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- This ledger deliberately has no shop foreign key. It must survive normal
-- tenant deletion so a restored backup can replay deletions before serving.
CREATE TABLE "deletion_tombstones" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "shopId" TEXT,
  "shopDomainHash" TEXT NOT NULL,
  "requestType" "PrivacyRequestType" NOT NULL,
  "subjectHash" TEXT,
  "requestedAt" TIMESTAMPTZ NOT NULL,
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deletion_tombstones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "safety_controls" (
  "id" TEXT NOT NULL,
  "shopId" TEXT,
  "controlKey" "SafetyControlKey" NOT NULL,
  "blocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "reasonCode" TEXT NOT NULL,
  "actorId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "safety_controls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entitlement_snapshots_shopId_verifiedAt_idx" ON "entitlement_snapshots"("shopId", "verifiedAt" DESC);
CREATE INDEX "entitlement_snapshots_shopId_expiresAt_idx" ON "entitlement_snapshots"("shopId", "expiresAt");
CREATE UNIQUE INDEX "privacy_requests_shopId_externalRequestId_key" ON "privacy_requests"("shopId", "externalRequestId");
CREATE INDEX "privacy_requests_shopId_state_dueAt_idx" ON "privacy_requests"("shopId", "state", "dueAt");
CREATE INDEX "privacy_requests_state_dueAt_idx" ON "privacy_requests"("state", "dueAt");
CREATE UNIQUE INDEX "deletion_tombstones_scopeKey_key" ON "deletion_tombstones"("scopeKey");
CREATE INDEX "deletion_tombstones_shopDomainHash_completedAt_idx" ON "deletion_tombstones"("shopDomainHash", "completedAt");
CREATE UNIQUE INDEX "safety_controls_shopId_controlKey_key" ON "safety_controls"("shopId", "controlKey");
CREATE UNIQUE INDEX "safety_controls_global_controlKey_key" ON "safety_controls"("controlKey") WHERE "shopId" IS NULL;
CREATE INDEX "safety_controls_controlKey_blocked_idx" ON "safety_controls"("controlKey", "blocked");

ALTER TABLE "entitlement_snapshots" ADD CONSTRAINT "entitlement_snapshots_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;
ALTER TABLE "safety_controls" ADD CONSTRAINT "safety_controls_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE;

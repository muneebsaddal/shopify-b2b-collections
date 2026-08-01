-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "ShopSyncStatus" AS ENUM (
  'NOT_STARTED',
  'SYNCING',
  'PARTIAL',
  'RECONCILING',
  'FRESH',
  'STALE',
  'FAILED'
);

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM (
  'SHOPIFY',
  'MERCHANT',
  'WORKER',
  'OPERATOR',
  'SYSTEM'
);

-- CreateTable
CREATE TABLE "shops" (
  "id" TEXT NOT NULL,
  "shopifyShopGid" TEXT,
  "shopDomain" TEXT NOT NULL,
  "status" "ShopStatus" NOT NULL DEFAULT 'INACTIVE',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uninstalledAt" TIMESTAMP(3),
  "globalRemindersPaused" BOOLEAN NOT NULL DEFAULT true,
  "scopesComplete" BOOLEAN NOT NULL DEFAULT false,
  "syncStatus" "ShopSyncStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "lastReconciledAt" TIMESTAMP(3),
  "settingsVersion" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- Preserve any locally persisted scaffold sessions while establishing a
-- stable tenant root. Shopify session IDs are not used as application tenant
-- identity.
INSERT INTO "shops" (
  "id",
  "shopDomain",
  "status",
  "installedAt",
  "globalRemindersPaused",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || md5(lower("shop")),
  lower("shop"),
  'INACTIVE'::"ShopStatus",
  CURRENT_TIMESTAMP,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Session"
GROUP BY lower("shop");

-- RenameTable
ALTER TABLE "Session" RENAME TO "shopify_sessions";
ALTER TABLE "shopify_sessions"
  RENAME CONSTRAINT "Session_pkey" TO "shopify_sessions_pkey";
ALTER INDEX "Session_shop_idx" RENAME TO "shopify_sessions_shop_idx";

-- AlterTable
ALTER TABLE "shopify_sessions"
  ADD COLUMN "shopId" TEXT,
  ADD COLUMN "grantedScopeFingerprint" TEXT,
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rotatedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3);

ALTER TABLE "shopify_sessions"
  DROP COLUMN "firstName",
  DROP COLUMN "lastName",
  DROP COLUMN "email",
  DROP COLUMN "locale";

UPDATE "shopify_sessions"
SET "shopId" = "shops"."id"
FROM "shops"
WHERE lower("shopify_sessions"."shop") = "shops"."shopDomain";

ALTER TABLE "shopify_sessions"
  ALTER COLUMN "shopId" SET NOT NULL;

-- Existing scaffold rows held plaintext credentials. They are removed during
-- this expand migration so no plaintext token survives the encryption
-- boundary. Re-authentication creates encrypted rows.
DELETE FROM "shopify_sessions";

-- CreateTable
CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "safeBefore" JSONB,
  "safeAfter" JSONB,
  "reason" TEXT,
  "correlationId" TEXT NOT NULL,
  "applicationVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protected_data_access_logs" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "actorId" TEXT,
  "purposeCode" TEXT NOT NULL,
  "resourceCategory" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "approvalReference" TEXT,
  "incidentReference" TEXT,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "protected_data_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_shopifyShopGid_key" ON "shops"("shopifyShopGid");
CREATE UNIQUE INDEX "shops_shopDomain_key" ON "shops"("shopDomain");
CREATE UNIQUE INDEX "shopify_sessions_shopId_id_key" ON "shopify_sessions"("shopId", "id");
CREATE INDEX "shopify_sessions_shopId_isOnline_expires_idx" ON "shopify_sessions"("shopId", "isOnline", "expires");
CREATE INDEX "audit_events_shopId_createdAt_idx" ON "audit_events"("shopId", "createdAt" DESC);
CREATE INDEX "audit_events_correlationId_idx" ON "audit_events"("correlationId");
CREATE INDEX "protected_data_access_logs_shopId_createdAt_idx" ON "protected_data_access_logs"("shopId", "createdAt" DESC);
CREATE INDEX "protected_data_access_logs_correlationId_idx" ON "protected_data_access_logs"("correlationId");

-- AddForeignKey
ALTER TABLE "shopify_sessions"
  ADD CONSTRAINT "shopify_sessions_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "protected_data_access_logs"
  ADD CONSTRAINT "protected_data_access_logs_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

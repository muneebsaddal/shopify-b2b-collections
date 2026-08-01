-- D2: prevent concurrent full synchronization work for the same tenant.
CREATE UNIQUE INDEX "sync_work_items_one_active_full_sync_per_shop_idx"
  ON "sync_work_items"("shopId", "resourceType")
  WHERE "resourceType" = 'FULL_SYNC'
    AND "state" IN ('QUEUED', 'PROCESSING');

-- D3: cached aging metadata and the currency/bucket dashboard access path.
CREATE TYPE "AgingBucket" AS ENUM (
  'CURRENT',
  'ONE_TO_THIRTY',
  'THIRTY_ONE_TO_SIXTY',
  'SIXTY_ONE_TO_NINETY',
  'NINETY_PLUS'
);

ALTER TABLE "receivables"
  ADD COLUMN "daysOverdue" INTEGER,
  ADD COLUMN "agingBucket" "AgingBucket";

CREATE INDEX "receivables_shopId_currency_agingBucket_dueAt_idx"
  ON "receivables"("shopId", "currency", "agingBucket", "dueAt");

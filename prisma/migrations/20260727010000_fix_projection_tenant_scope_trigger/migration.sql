-- D2 repair: the original polymorphic trigger referenced NEW fields inside
-- SQL subqueries. PostgreSQL resolved NEW as a relation when the trigger ran.
-- Convert the trigger row to JSON once so every table-specific check can read
-- only the fields that exist on that row.
CREATE OR REPLACE FUNCTION "enforce_projection_tenant_scope"()
RETURNS TRIGGER AS $$
DECLARE
  row_data JSONB;
BEGIN
  row_data := to_jsonb(NEW);

  IF TG_TABLE_NAME = 'company_locations' AND NOT EXISTS (
    SELECT 1
    FROM "companies" AS company
    WHERE company."id" = row_data->>'companyId'
      AND company."shopId" = row_data->>'shopId'
  ) THEN
    RAISE EXCEPTION 'company location tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'company_contacts' AND NOT EXISTS (
    SELECT 1
    FROM "companies" AS company
    WHERE company."id" = row_data->>'companyId'
      AND company."shopId" = row_data->>'shopId'
  ) THEN
    RAISE EXCEPTION 'company contact tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'receivables'
    AND row_data->>'companyId' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "companies" AS company
      WHERE company."id" = row_data->>'companyId'
        AND company."shopId" = row_data->>'shopId'
    )
  THEN
    RAISE EXCEPTION 'receivable company tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'receivables'
    AND row_data->>'companyLocationId' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "company_locations" AS location
      WHERE location."id" = row_data->>'companyLocationId'
        AND location."shopId" = row_data->>'shopId'
    )
  THEN
    RAISE EXCEPTION 'receivable location tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'payment_schedules' AND NOT EXISTS (
    SELECT 1
    FROM "receivables" AS receivable
    WHERE receivable."id" = row_data->>'receivableId'
      AND receivable."shopId" = row_data->>'shopId'
  ) THEN
    RAISE EXCEPTION 'payment schedule tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'receivable_state_transitions' AND NOT EXISTS (
    SELECT 1
    FROM "receivables" AS receivable
    WHERE receivable."id" = row_data->>'receivableId'
      AND receivable."shopId" = row_data->>'shopId'
  ) THEN
    RAISE EXCEPTION 'receivable transition tenant mismatch';
  END IF;

  IF TG_TABLE_NAME = 'sync_work_items'
    AND row_data->>'receiptId' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "webhook_receipts" AS receipt
      WHERE receipt."id" = row_data->>'receiptId'
        AND receipt."shopId" = row_data->>'shopId'
    )
  THEN
    RAISE EXCEPTION 'sync work receipt tenant mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

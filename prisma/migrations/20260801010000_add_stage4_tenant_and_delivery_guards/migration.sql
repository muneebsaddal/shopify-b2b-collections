-- Stage 4 hardening: enforce tenant ownership for every D4 relationship and
-- prevent a same-shop reminder delivery from combining unrelated companies or
-- policy versions.
CREATE FUNCTION "enforce_d4_tenant_scope"()
RETURNS TRIGGER AS $$
DECLARE row_data JSONB := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'collection_notes' AND row_data->>'companyId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'collection note company tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'collection_notes' AND row_data->>'receivableId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "receivables" r
    WHERE r."id" = row_data->>'receivableId' AND r."shopId" = row_data->>'shopId'
      AND (row_data->>'companyId' IS NULL OR r."companyId" = row_data->>'companyId')
  ) THEN RAISE EXCEPTION 'collection note receivable tenant mismatch'; END IF;

  IF TG_TABLE_NAME = 'promises_to_pay' AND NOT EXISTS (
    SELECT 1 FROM "receivables" r
    WHERE r."id" = row_data->>'receivableId' AND r."shopId" = row_data->>'shopId'
      AND (row_data->>'companyId' IS NULL OR r."companyId" = row_data->>'companyId')
  ) THEN RAISE EXCEPTION 'promise receivable tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'promises_to_pay' AND row_data->>'companyId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'promise company tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'promises_to_pay' AND row_data->>'supersededById' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "promises_to_pay" p
    WHERE p."id" = row_data->>'supersededById' AND p."shopId" = row_data->>'shopId'
      AND p."receivableId" = row_data->>'receivableId'
  ) THEN RAISE EXCEPTION 'promise supersession mismatch'; END IF;

  IF TG_TABLE_NAME = 'collection_actions' AND row_data->>'companyId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'collection action company tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'collection_actions' AND row_data->>'receivableId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "receivables" r
    WHERE r."id" = row_data->>'receivableId' AND r."shopId" = row_data->>'shopId'
      AND (row_data->>'companyId' IS NULL OR r."companyId" = row_data->>'companyId')
  ) THEN RAISE EXCEPTION 'collection action receivable tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'collection_actions' AND row_data->>'noteId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "collection_notes" n WHERE n."id" = row_data->>'noteId' AND n."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'collection action note tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'collection_actions' AND row_data->>'promiseId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "promises_to_pay" p WHERE p."id" = row_data->>'promiseId' AND p."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'collection action promise tenant mismatch'; END IF;

  IF TG_TABLE_NAME = 'reliability_snapshots' AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'reliability snapshot company tenant mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collection_notes_tenant_scope" BEFORE INSERT OR UPDATE ON "collection_notes" FOR EACH ROW EXECUTE FUNCTION "enforce_d4_tenant_scope"();
CREATE TRIGGER "promises_to_pay_tenant_scope" BEFORE INSERT OR UPDATE ON "promises_to_pay" FOR EACH ROW EXECUTE FUNCTION "enforce_d4_tenant_scope"();
CREATE TRIGGER "collection_actions_tenant_scope" BEFORE INSERT OR UPDATE ON "collection_actions" FOR EACH ROW EXECUTE FUNCTION "enforce_d4_tenant_scope"();
CREATE TRIGGER "reliability_snapshots_tenant_scope" BEFORE INSERT OR UPDATE ON "reliability_snapshots" FOR EACH ROW EXECUTE FUNCTION "enforce_d4_tenant_scope"();

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
    WHERE v."id" = row_data->>'activeVersionId' AND v."shopId" = row_data->>'shopId' AND v."reminderPolicyId" = row_data->>'id'
  ) THEN RAISE EXCEPTION 'active reminder version tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'reminder_policy_stages' AND NOT EXISTS (
    SELECT 1 FROM "reminder_policy_versions" v WHERE v."id" = row_data->>'reminderPolicyVersionId' AND v."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'reminder stage tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'reminder_deliveries' AND (
    NOT EXISTS (
      SELECT 1 FROM "receivables" r
      JOIN "company_contacts" c ON c."companyId" = r."companyId" AND c."shopId" = r."shopId"
      WHERE r."id" = row_data->>'receivableId' AND r."shopId" = row_data->>'shopId' AND c."id" = row_data->>'companyContactId'
    )
    OR NOT EXISTS (
      SELECT 1 FROM "reminder_policy_stages" s
      WHERE s."id" = row_data->>'reminderPolicyStageId' AND s."shopId" = row_data->>'shopId'
        AND s."reminderPolicyVersionId" = row_data->>'reminderPolicyVersionId'
    )
  ) THEN RAISE EXCEPTION 'reminder delivery relationship mismatch'; END IF;
  IF TG_TABLE_NAME = 'statement_runs' AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'statement tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'company_reminder_suppressions' AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'company suppression tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'recipient_suppressions' AND row_data->>'companyId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c."id" = row_data->>'companyId' AND c."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'recipient suppression company tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'recipient_suppressions' AND row_data->>'companyContactId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "company_contacts" c
    WHERE c."id" = row_data->>'companyContactId' AND c."shopId" = row_data->>'shopId'
      AND (row_data->>'companyId' IS NULL OR c."companyId" = row_data->>'companyId')
  ) THEN RAISE EXCEPTION 'recipient suppression contact tenant mismatch'; END IF;
  IF TG_TABLE_NAME = 'email_provider_events' AND NOT EXISTS (
    SELECT 1 FROM "reminder_deliveries" d WHERE d."id" = row_data->>'reminderDeliveryId' AND d."shopId" = row_data->>'shopId'
  ) THEN RAISE EXCEPTION 'provider event tenant mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

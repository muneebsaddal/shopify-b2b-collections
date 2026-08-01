-- Stage 4 privacy recovery: reply-to verification is tenant-owned. Deleting a
-- shop must not be blocked by reminder versions that are being purged in the
-- same tenant cascade.
ALTER TABLE "reminder_policy_versions"
  DROP CONSTRAINT "reminder_policy_versions_replyToVerificationId_fkey";

ALTER TABLE "reminder_policy_versions"
  ADD CONSTRAINT "reminder_policy_versions_replyToVerificationId_fkey"
  FOREIGN KEY ("replyToVerificationId")
  REFERENCES "reply_to_verifications"("id")
  ON DELETE CASCADE;

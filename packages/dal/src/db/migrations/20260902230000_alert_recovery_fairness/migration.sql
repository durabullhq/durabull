ALTER TABLE "alert_rule" ADD COLUMN "deletion_retry_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alert_rule" ADD COLUMN "deletion_claim_token" text;
--> statement-breakpoint
ALTER TABLE "alert_rule" ADD COLUMN "deletion_claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_reason" text;
--> statement-breakpoint
UPDATE "alert_rule"
SET "deletion_retry_at" = "deletion_requested_at"
WHERE "deletion_requested_at" IS NOT NULL;
--> statement-breakpoint
UPDATE "alert_event"
SET "linear_resolution_reason" = 'legacy'
WHERE "linear_resolution_sync_pending" = true;
--> statement-breakpoint
DROP INDEX "alert_rule_deletion_requested_idx";
--> statement-breakpoint
CREATE INDEX "alert_rule_deletion_requested_idx"
	ON "alert_rule" USING btree ("deletion_retry_at", "deletion_requested_at")
	WHERE "deletion_requested_at" IS NOT NULL;

ALTER TABLE "alert_rule" ADD COLUMN "deletion_requested_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "alert_rule_deletion_requested_idx"
	ON "alert_rule" USING btree ("deletion_requested_at")
	WHERE "deletion_requested_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "alert_event_cleanup_fired_at_idx" ON "alert_event" USING btree ("fired_at");

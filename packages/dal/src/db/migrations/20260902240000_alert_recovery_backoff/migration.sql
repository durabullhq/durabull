ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_retry_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "alert_event"
SET "linear_resolution_retry_at" = now()
WHERE "linear_resolution_sync_pending" = true;
--> statement-breakpoint
DROP INDEX "alert_event_linear_resolution_pending_idx";
--> statement-breakpoint
CREATE INDEX "alert_event_linear_resolution_pending_idx"
	ON "alert_event" USING btree ("linear_resolution_retry_at", "updated_at")
	WHERE "status" = 'resolved' AND "linear_resolution_sync_pending" = true;

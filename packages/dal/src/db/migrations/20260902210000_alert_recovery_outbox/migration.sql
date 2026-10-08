ALTER TABLE "alert_check_cursor" ADD COLUMN "last_observation_token" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_sync_pending" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_sync_claim_token" text;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_sync_claimed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "alert_event" AS event
SET "linear_resolution_sync_pending" = true
WHERE event."status" = 'resolved'
	AND (
		event."context"->>'migrationLinearSyncPending' = 'true'
		OR event."context"->>'linearResolutionSyncPending' = 'true'
	);
--> statement-breakpoint
CREATE INDEX "alert_event_linear_resolution_pending_idx"
	ON "alert_event" USING btree ("updated_at")
	WHERE "status" = 'resolved' AND "linear_resolution_sync_pending" = true;

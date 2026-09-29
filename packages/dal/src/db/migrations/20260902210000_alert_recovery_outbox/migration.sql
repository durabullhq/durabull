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
		OR EXISTS (
			SELECT 1
			FROM "alert_delivery" AS delivery
			WHERE delivery."alert_event_id" = event."id"
				AND (
					delivery."channel_type" = 'linear'
					OR (
						delivery."channel_type" = 'destination'
						AND delivery."provider_metadata"->>'resolvedType' = 'linear'
					)
				)
				AND delivery."status" = 'delivered'
				AND delivery."external_id" IS NOT NULL
		)
	);
--> statement-breakpoint
CREATE INDEX "alert_event_linear_resolution_pending_idx"
	ON "alert_event" USING btree ("updated_at")
	WHERE "status" = 'resolved' AND "linear_resolution_sync_pending" = true;

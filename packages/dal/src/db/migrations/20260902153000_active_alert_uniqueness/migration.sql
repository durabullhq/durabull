LOCK TABLE "alert_event" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
WITH ranked_firing_events AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "alert_rule_id", "queue_name"
			ORDER BY "fired_at" DESC, "id" DESC
		) AS "rank"
	FROM "alert_event"
	WHERE "status" = 'firing'
		AND "type" IN ('failure_threshold', 'failure_rate', 'queue_stalled', 'redis_health')
),
losing_events AS (
	SELECT "id" FROM ranked_firing_events WHERE "rank" > 1
)
UPDATE "alert_delivery"
SET
	"status" = 'failed',
	"next_retry_at" = NULL,
	"claimed_at" = NULL,
	"last_error" = 'Canceled because a duplicate active incident was consolidated during migration.',
	"updated_at" = now()
WHERE "alert_event_id" IN (SELECT "id" FROM losing_events)
	AND (
		"status" IN ('pending', 'claimed')
		OR ("status" = 'failed' AND "next_retry_at" IS NOT NULL)
	);
--> statement-breakpoint
WITH ranked_firing_events AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "alert_rule_id", "queue_name"
			ORDER BY "fired_at" DESC, "id" DESC
		) AS "rank"
	FROM "alert_event"
	WHERE "status" = 'firing'
		AND "type" IN ('failure_threshold', 'failure_rate', 'queue_stalled', 'redis_health')
)
UPDATE "alert_event" AS event
SET
	"status" = 'resolved',
	"resolved_at" = coalesce(event."resolved_at", now()),
	"updated_at" = now(),
	"context" = CASE
		WHEN EXISTS (
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
		) THEN jsonb_set(
			coalesce(event."context", '{}'::jsonb),
			'{migrationLinearSyncPending}',
			'true'::jsonb,
			true
		)
		ELSE event."context"
	END
FROM ranked_firing_events AS ranked
WHERE event."id" = ranked."id"
	AND ranked."rank" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "alert_event_active_rule_scope_idx"
	ON "alert_event" USING btree ("alert_rule_id", "queue_name")
	WHERE "status" = 'firing'
		AND "type" IN ('failure_threshold', 'failure_rate', 'queue_stalled', 'redis_health');

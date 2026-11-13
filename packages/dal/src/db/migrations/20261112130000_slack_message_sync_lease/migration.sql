-- Slack message sync ownership and refresh requests.
-- sync_lease_token fences completion writes to the worker that holds the lease;
-- refresh_requested_at re-renders a message whose incident state is unchanged
-- (rule snoozed, job retried, Slack actions toggled) until Slack shows it.
ALTER TABLE "slack_alert_message" ADD COLUMN IF NOT EXISTS "sync_lease_token" text;
--> statement-breakpoint
ALTER TABLE "slack_alert_message" ADD COLUMN IF NOT EXISTS "refresh_requested_at" timestamp with time zone;

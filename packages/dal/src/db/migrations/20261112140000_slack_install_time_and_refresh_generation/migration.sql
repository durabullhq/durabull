-- installed_at lets a late app_uninstalled/tokens_revoked event (Slack does not
-- order them) revoke only the installation that existed when it occurred.
ALTER TABLE "slack_installation" ADD COLUMN IF NOT EXISTS "installed_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
-- refresh_generation identifies each refresh request, so a sync clears only the
-- request it rendered, without comparing clocks across API replicas.
ALTER TABLE "slack_alert_message" ADD COLUMN IF NOT EXISTS "refresh_generation" integer DEFAULT 0 NOT NULL;

-- Slack app integration: one workspace installation per organization, the
-- OAuth state used to install it, and the Slack messages posted for alert
-- deliveries so incident state changes can be mirrored back into Slack.
ALTER TABLE "alert_event" ADD COLUMN "resolved_by" text;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_resolved_by_user_id_fk"
  FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE "slack_installation" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "slack_team_id" text NOT NULL,
  "slack_team_name" text NOT NULL,
  "slack_team_url" text,
  "slack_enterprise_id" text,
  "slack_app_id" text,
  "bot_user_id" text NOT NULL,
  "encrypted_bot_token" text NOT NULL,
  "encrypted_refresh_token" text,
  "bot_token_expires_at" timestamp with time zone,
  "scopes" text NOT NULL,
  "installed_by_user_id" text,
  "installed_by_slack_user_id" text,
  "status" text DEFAULT 'active' NOT NULL,
  "status_reason" text,
  "actions_enabled" boolean DEFAULT true NOT NULL,
  "unfurls_enabled" boolean DEFAULT true NOT NULL,
  "last_validated_at" timestamp with time zone,
  CONSTRAINT "slack_installation_organization_id_unique" UNIQUE("organization_id"),
  CONSTRAINT "slack_installation_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
  CONSTRAINT "slack_installation_installed_by_user_id_user_id_fk"
    FOREIGN KEY ("installed_by_user_id") REFERENCES "user"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "slack_installation_team_idx" ON "slack_installation" ("slack_team_id");
--> statement-breakpoint
CREATE TABLE "slack_oauth_state" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "user_id" text NOT NULL,
  "state_hash" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "return_to" text DEFAULT 'integrations' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "slack_oauth_state_state_hash_unique" UNIQUE("state_hash"),
  CONSTRAINT "slack_oauth_state_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "slack_oauth_state_expires_at_idx" ON "slack_oauth_state" ("expires_at");
--> statement-breakpoint
CREATE TABLE "slack_alert_message" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "alert_event_id" uuid NOT NULL,
  "alert_delivery_id" uuid NOT NULL,
  "destination_id" uuid,
  "slack_team_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "message_ts" text NOT NULL,
  "permalink" text,
  "rendered_state" text NOT NULL,
  "rendered_acknowledged_by" text,
  "sync_attempts" integer DEFAULT 0 NOT NULL,
  "next_sync_at" timestamp with time zone,
  "last_sync_error" text,
  "last_synced_at" timestamp with time zone,
  CONSTRAINT "slack_alert_message_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
  CONSTRAINT "slack_alert_message_alert_event_id_alert_event_id_fk"
    FOREIGN KEY ("alert_event_id") REFERENCES "alert_event"("id") ON DELETE cascade,
  CONSTRAINT "slack_alert_message_alert_delivery_id_alert_delivery_id_fk"
    FOREIGN KEY ("alert_delivery_id") REFERENCES "alert_delivery"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "slack_alert_message_delivery_idx" ON "slack_alert_message" ("alert_delivery_id");
--> statement-breakpoint
CREATE INDEX "slack_alert_message_event_idx" ON "slack_alert_message" ("alert_event_id");
--> statement-breakpoint
CREATE INDEX "slack_alert_message_channel_ts_idx" ON "slack_alert_message" ("channel_id", "message_ts");

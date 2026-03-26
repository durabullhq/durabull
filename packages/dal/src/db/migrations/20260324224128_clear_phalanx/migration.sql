CREATE TABLE "alert_check_cursor" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connection_id" uuid NOT NULL,
	"queue_name" text NOT NULL,
	"last_checked_at" timestamp with time zone NOT NULL,
	"last_failed_count" integer DEFAULT 0 NOT NULL,
	"last_completed_count" integer DEFAULT 0 NOT NULL,
	"last_metrics_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "alert_event" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"alert_rule_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"queue_name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'firing' NOT NULL,
	"summary" text NOT NULL,
	"context" jsonb,
	"fired_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"notification_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alert_rule" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"queue_name" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notification_channels" jsonb DEFAULT '[]' NOT NULL,
	"cooldown_minutes" integer DEFAULT 30 NOT NULL,
	"queue_filter_mode" text,
	"filter_queue_names" jsonb DEFAULT '[]'
);
--> statement-breakpoint
CREATE INDEX "alert_rule_conn_org_idx" ON "alert_rule" ("connection_id","organization_id");--> statement-breakpoint
CREATE INDEX "alert_rule_enabled_idx" ON "alert_rule" ("enabled") WHERE "enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_check_cursor_connection_queue_idx" ON "alert_check_cursor" ("connection_id","queue_name");--> statement-breakpoint
CREATE INDEX "alert_event_rule_id_status_idx" ON "alert_event" ("alert_rule_id","status");--> statement-breakpoint
CREATE INDEX "alert_event_org_id_fired_at_idx" ON "alert_event" ("organization_id","fired_at");--> statement-breakpoint
CREATE INDEX "alert_event_conn_queue_status_idx" ON "alert_event" ("connection_id","queue_name","status");--> statement-breakpoint
ALTER TABLE "alert_check_cursor" ADD CONSTRAINT "alert_check_cursor_connection_id_redis_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "redis_connection"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_alert_rule_id_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rule"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_connection_id_redis_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "redis_connection"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_rule" ADD CONSTRAINT "alert_rule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_rule" ADD CONSTRAINT "alert_rule_connection_id_redis_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "redis_connection"("id") ON DELETE CASCADE;
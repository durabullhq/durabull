ALTER TABLE "alert_rule" ADD COLUMN "muted_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "acknowledged_by" text;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "alert_webhook_destination" RENAME TO "alert_destination";--> statement-breakpoint
ALTER TABLE "alert_destination" ADD COLUMN "type" text DEFAULT 'webhook' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_destination" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_destination" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER INDEX "alert_webhook_destination_org_idx" RENAME TO "alert_destination_org_idx";--> statement-breakpoint
ALTER INDEX "alert_webhook_destination_org_name_idx" RENAME TO "alert_destination_org_name_idx";

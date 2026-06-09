CREATE TABLE "alert_webhook_destination" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"encrypted_signing_secret" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alert_webhook_destination_org_idx" ON "alert_webhook_destination" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_webhook_destination_org_name_idx" ON "alert_webhook_destination" ("organization_id","name");--> statement-breakpoint
ALTER TABLE "alert_webhook_destination" ADD CONSTRAINT "alert_webhook_destination_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX "alert_delivery_pending_created_idx" ON "alert_delivery" ("created_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "alert_delivery_failed_retry_created_idx" ON "alert_delivery" ("next_retry_at","created_at") WHERE "status" = 'failed' AND "next_retry_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "alert_delivery_claimed_stale_idx" ON "alert_delivery" ("claimed_at") WHERE "status" = 'claimed';

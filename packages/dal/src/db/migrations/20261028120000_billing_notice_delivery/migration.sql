-- Billing notice emails (beta transition notice and reminders), one row per
-- organization owner per notice, so sending is idempotent and retryable.
CREATE TABLE "billing_notice_delivery" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "kind" text NOT NULL,
  "user_id" text NOT NULL,
  "email" text NOT NULL,
  "status" text NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL,
  "provider_message_id" text,
  "error" text,
  "sent_at" timestamp with time zone,
  CONSTRAINT "billing_notice_delivery_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_notice_delivery_unique_idx"
  ON "billing_notice_delivery" ("organization_id", "kind", "user_id");

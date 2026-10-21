-- Audit trail for manual billing changes and organization deletion. No foreign
-- key: rows must outlive the organization so refunds and disputes stay traceable.
CREATE TABLE "billing_operator_action" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "action" text NOT NULL,
  "actor" text NOT NULL,
  "reason" text NOT NULL,
  "details" jsonb
);
--> statement-breakpoint
CREATE INDEX "billing_operator_action_org_idx"
  ON "billing_operator_action" ("organization_id");

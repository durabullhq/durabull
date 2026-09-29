CREATE TABLE "linear_issue_resolution" (
	"issue_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linear_issue_resolution" ADD CONSTRAINT "linear_issue_resolution_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "linear_issue_resolution_completed_idx"
	ON "linear_issue_resolution" USING btree ("completed_at")
	WHERE "completed_at" IS NOT NULL;

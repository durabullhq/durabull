ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_failed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "linear_resolution_last_error" text;
--> statement-breakpoint
ALTER TABLE "linear_issue_resolution" ADD COLUMN "comment_id" uuid;

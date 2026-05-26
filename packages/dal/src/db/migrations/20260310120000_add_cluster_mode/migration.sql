ALTER TABLE "redis_connection" ADD COLUMN "mode" text DEFAULT 'standalone' NOT NULL;
--> statement-breakpoint
ALTER TABLE "redis_connection" ADD CONSTRAINT "redis_connection_mode_check" CHECK ("mode" IN ('standalone', 'cluster'));

CREATE TABLE "redis_health_sample" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connection_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"memory_capacity_source" text DEFAULT 'unknown' NOT NULL,
	"memory_usage_percent" double precision,
	"used_memory_bytes" bigint,
	"resident_memory_bytes" bigint,
	"memory_capacity_bytes" bigint,
	"cpu_usage_percent" double precision,
	"cpu_seconds" double precision,
	"memory_fragmentation_ratio" double precision,
	"memory_fragmentation_bytes" bigint,
	"connected_clients_percent" double precision,
	"connected_clients" integer,
	"max_clients" integer,
	"blocked_clients" integer,
	"evicted_keys" bigint,
	"evicted_keys_per_minute" double precision,
	"rejected_connections" bigint,
	"rejected_connections_per_minute" double precision,
	CONSTRAINT "redis_health_sample_connection_id_redis_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "redis_connection"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "redis_health_sample_connection_minute_idx" ON "redis_health_sample" USING btree ("connection_id","captured_at");
--> statement-breakpoint
CREATE INDEX "redis_health_sample_captured_at_idx" ON "redis_health_sample" USING btree ("captured_at");

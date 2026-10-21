ALTER TABLE "redis_connection" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE "organization_billing_account" (
  "organization_id" text PRIMARY KEY NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "livemode" boolean DEFAULT false NOT NULL,
  "billing_contact_user_id" text,
  "trial_consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_billing_account_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
  CONSTRAINT "organization_billing_account_billing_contact_user_id_user_id_fk"
    FOREIGN KEY ("billing_contact_user_id") REFERENCES "user"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_account_customer_idx"
  ON "organization_billing_account" ("stripe_customer_id");
--> statement-breakpoint
CREATE TABLE "billing_subscription" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "stripe_subscription_id" text NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "stripe_price_id" text,
  "stripe_subscription_item_id" text,
  "plan_code" text,
  "billing_interval" text,
  "status" text NOT NULL,
  "collection_method" text DEFAULT 'charge_automatically' NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "cancel_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "trial_start" timestamp with time zone,
  "trial_end" timestamp with time zone,
  "pause_collection" boolean DEFAULT false NOT NULL,
  "latest_invoice_id" text,
  "latest_invoice_status" text,
  "latest_invoice_paid" boolean,
  "paid_through" timestamp with time zone,
  "last_paid_plan_code" text,
  "past_due_since" timestamp with time zone,
  "is_current" boolean DEFAULT false NOT NULL,
  "stripe_created_at" timestamp with time zone,
  "last_reconciled_at" timestamp with time zone,
  CONSTRAINT "billing_subscription_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscription_stripe_id_idx"
  ON "billing_subscription" ("stripe_subscription_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscription_current_idx"
  ON "billing_subscription" ("organization_id") WHERE "is_current";
--> statement-breakpoint
CREATE INDEX "billing_subscription_org_idx" ON "billing_subscription" ("organization_id");
--> statement-breakpoint
CREATE TABLE "organization_entitlement" (
  "organization_id" text PRIMARY KEY NOT NULL,
  "plan_code" text NOT NULL,
  "subscribed_plan_code" text,
  "source" text NOT NULL,
  "catalog_version" text NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "features" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enforced" boolean DEFAULT false NOT NULL,
  "degraded" boolean DEFAULT false NOT NULL,
  "notices" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_paid_plan_code" text,
  "grace_expires_at" timestamp with time zone,
  "migration_grant_expires_at" timestamp with time zone,
  "capacity_adjustment_expires_at" timestamp with time zone,
  "last_capacity_adjustment_ended_at" timestamp with time zone,
  "history_retention_floor_days" integer,
  "history_retention_floor_expires_at" timestamp with time zone,
  "contract_limits" jsonb,
  "reevaluate_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_entitlement_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "organization_entitlement_reevaluate_idx"
  ON "organization_entitlement" ("reevaluate_at") WHERE "reevaluate_at" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "billing_webhook_event" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "livemode" boolean DEFAULT false NOT NULL,
  "stripe_object_id" text,
  "stripe_customer_id" text,
  "organization_id" text,
  "status" text DEFAULT 'pending' NOT NULL
    CONSTRAINT "billing_webhook_event_status_check"
    CHECK ("status" IN ('pending', 'processing', 'processed', 'failed', 'dead')),
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "last_error" text,
  "stripe_created_at" timestamp with time zone,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "billing_webhook_event_due_idx"
  ON "billing_webhook_event" ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX "billing_webhook_event_customer_idx"
  ON "billing_webhook_event" ("stripe_customer_id");
--> statement-breakpoint
CREATE TABLE "billing_checkout_attempt" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "created_by_user_id" text,
  "plan_code" text NOT NULL,
  "billing_interval" text NOT NULL,
  "stripe_price_id" text NOT NULL,
  "trial" boolean DEFAULT false NOT NULL,
  "stripe_session_id" text,
  "url" text,
  "status" text DEFAULT 'open' NOT NULL
    CONSTRAINT "billing_checkout_attempt_status_check"
    CHECK ("status" IN ('open', 'completed', 'expired', 'failed')),
  "idempotency_key" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "billing_checkout_attempt_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
  CONSTRAINT "billing_checkout_attempt_created_by_user_id_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_attempt_open_idx"
  ON "billing_checkout_attempt" ("organization_id") WHERE "status" = 'open';
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_attempt_session_idx"
  ON "billing_checkout_attempt" ("stripe_session_id");
--> statement-breakpoint
CREATE TABLE "billing_resource_suspension" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "resource_kind" text NOT NULL
    CONSTRAINT "billing_resource_suspension_kind_check"
    CHECK ("resource_kind" IN ('connection', 'member', 'invitation', 'alert_rule', 'alert_destination', 'service_account')),
  "resource_id" text NOT NULL,
  "reason" text NOT NULL,
  CONSTRAINT "billing_resource_suspension_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_resource_suspension_resource_idx"
  ON "billing_resource_suspension" ("resource_kind", "resource_id");
--> statement-breakpoint
CREATE INDEX "billing_resource_suspension_org_idx"
  ON "billing_resource_suspension" ("organization_id");
--> statement-breakpoint
CREATE TABLE "billing_entitlement_override" (
  "id" uuid PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "plan_code" text NOT NULL,
  "limits" jsonb,
  "reason" text NOT NULL,
  "created_by" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" text,
  CONSTRAINT "billing_entitlement_override_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "billing_entitlement_override_org_idx"
  ON "billing_entitlement_override" ("organization_id");
--> statement-breakpoint
-- Capacity enforcement lives in the database so concurrent requests, the
-- Better Auth plugin endpoints and any future write path share one boundary.
-- Limits come from the materialized organization_entitlement row; a missing
-- or unenforced row (self-hosted, shadow mode) imposes no limit.
CREATE OR REPLACE FUNCTION durabull_plan_limit(org_id text, limit_key text)
RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
  allowed integer;
BEGIN
  SELECT CASE
           WHEN e.enforced AND jsonb_typeof(e.limits -> limit_key) = 'number'
             THEN (e.limits ->> limit_key)::integer
           ELSE NULL
         END
    INTO allowed
    FROM organization_entitlement e
   WHERE e.organization_id = org_id;
  RETURN allowed;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_capacity_usage(org_id text, limit_key text)
RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
  used integer := 0;
BEGIN
  IF limit_key = 'connections.enabled' THEN
    SELECT count(*) INTO used
      FROM redis_connection c
     WHERE c.organization_id = org_id
       AND c.enabled
       AND NOT EXISTS (
         SELECT 1 FROM billing_resource_suspension s
          WHERE s.resource_kind = 'connection' AND s.resource_id = c.id::text
       );
  ELSIF limit_key = 'members.reserved' THEN
    SELECT
      (SELECT count(*) FROM member m
        WHERE m.organization_id = org_id
          AND NOT EXISTS (
            SELECT 1 FROM billing_resource_suspension s
             WHERE s.resource_kind = 'member' AND s.resource_id = m.id
          ))
      +
      (SELECT count(*) FROM invitation i
        WHERE i.organization_id = org_id
          AND i.status = 'pending'
          AND i.expires_at > now()
          AND NOT EXISTS (
            SELECT 1 FROM billing_resource_suspension s
             WHERE s.resource_kind = 'invitation' AND s.resource_id = i.id
          ))
      INTO used;
  ELSIF limit_key = 'alerts.enabled' THEN
    SELECT count(*) INTO used
      FROM alert_rule r
     WHERE r.organization_id = org_id
       AND r.enabled
       AND r.deletion_requested_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM billing_resource_suspension s
          WHERE s.resource_kind = 'alert_rule' AND s.resource_id = r.id::text
       );
  ELSIF limit_key = 'alerts.destinations' THEN
    SELECT count(*) INTO used
      FROM alert_destination d
     WHERE d.organization_id = org_id
       AND NOT EXISTS (
         SELECT 1 FROM billing_resource_suspension s
          WHERE s.resource_kind = 'alert_destination' AND s.resource_id = d.id::text
       );
  ELSIF limit_key = 'service_accounts.enabled' THEN
    SELECT count(*) INTO used
      FROM mcp_service_account a
     WHERE a.organization_id = org_id
       AND NOT a.disabled
       AND NOT EXISTS (
         SELECT 1 FROM billing_resource_suspension s
          WHERE s.resource_kind = 'service_account' AND s.resource_id = a.id::text
       );
  END IF;
  RETURN used;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_assert_capacity(org_id text, limit_key text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  allowed integer;
  used integer;
BEGIN
  -- Serialize reservations per organization until commit so two concurrent
  -- creates at N-1 of N cannot both pass.
  PERFORM pg_advisory_xact_lock(hashtextextended('durabull_capacity:' || org_id, 0));
  allowed := durabull_plan_limit(org_id, limit_key);
  IF allowed IS NULL THEN
    RETURN;
  END IF;
  used := durabull_capacity_usage(org_id, limit_key);
  IF used >= allowed THEN
    RAISE EXCEPTION 'durabull_plan_limit_reached'
      USING ERRCODE = 'DBL01',
            DETAIL = json_build_object('limit', limit_key, 'usage', used, 'allowed', allowed)::text;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_redis_connection_capacity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled AND (TG_OP = 'INSERT' OR NOT OLD.enabled) THEN
    PERFORM durabull_assert_capacity(NEW.organization_id, 'connections.enabled');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "redis_connection_capacity"
  BEFORE INSERT OR UPDATE OF "enabled" ON "redis_connection"
  FOR EACH ROW EXECUTE FUNCTION durabull_redis_connection_capacity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_member_capacity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM durabull_assert_capacity(NEW.organization_id, 'members.reserved');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "member_capacity"
  BEFORE INSERT ON "member"
  FOR EACH ROW EXECUTE FUNCTION durabull_member_capacity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_invitation_capacity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
    PERFORM durabull_assert_capacity(NEW.organization_id, 'members.reserved');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "invitation_capacity"
  BEFORE INSERT OR UPDATE OF "status" ON "invitation"
  FOR EACH ROW EXECUTE FUNCTION durabull_invitation_capacity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_alert_rule_capacity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled AND NEW.deletion_requested_at IS NULL AND (
    TG_OP = 'INSERT' OR NOT (OLD.enabled AND OLD.deletion_requested_at IS NULL)
  ) THEN
    PERFORM durabull_assert_capacity(NEW.organization_id, 'alerts.enabled');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "alert_rule_capacity"
  BEFORE INSERT OR UPDATE OF "enabled", "deletion_requested_at" ON "alert_rule"
  FOR EACH ROW EXECUTE FUNCTION durabull_alert_rule_capacity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_alert_destination_capacity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM durabull_assert_capacity(NEW.organization_id, 'alerts.destinations');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "alert_destination_capacity"
  BEFORE INSERT ON "alert_destination"
  FOR EACH ROW EXECUTE FUNCTION durabull_alert_destination_capacity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION durabull_service_account_capacity()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.disabled AND (TG_OP = 'INSERT' OR OLD.disabled) THEN
    PERFORM durabull_assert_capacity(NEW.organization_id, 'service_accounts.enabled');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "mcp_service_account_capacity"
  BEFORE INSERT OR UPDATE OF "disabled" ON "mcp_service_account"
  FOR EACH ROW EXECUTE FUNCTION durabull_service_account_capacity();

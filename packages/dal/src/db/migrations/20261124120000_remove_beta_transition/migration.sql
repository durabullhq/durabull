-- The beta-to-paid transition has ended. Recompute any entitlement that still
-- draws access from the beta migration grant, then drop the grant and the
-- transition notice bookkeeping.
UPDATE "organization_entitlement" SET "reevaluate_at" = now() WHERE "source" = 'migration_grant';
--> statement-breakpoint
ALTER TABLE "organization_entitlement" DROP COLUMN IF EXISTS "migration_grant_expires_at";
--> statement-breakpoint
DROP TABLE IF EXISTS "billing_notice_delivery";

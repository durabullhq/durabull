# Durabull Cloud billing operations runbook

Operational guide for Durabull Cloud subscriptions. The design is recorded in
[ADR-0002](adr/0002-cloud-billing-entitlements.md).

## Responsibility split

| Stripe owns | Durabull owns |
| --- | --- |
| Products, Prices, Customers, Subscriptions | Organization ↔ Customer binding and billing authority (owner only) |
| Hosted Checkout, Customer Portal, payment authentication | Organization-bound Checkout/Portal sessions (`/api/billing/*`) |
| Charges, invoices, receipts, retries, dunning email | Verified subscription projection, entitlements, grace, downgrade and suspension policy |
| Tax calculation when configured | Tax registrations and filings (business obligation, not automatic) |

Stripe is never called on the request path. Access decisions read the materialized
`organization_entitlement` row (15-second process cache, re-materialized when a recorded deadline
passes). Capacity limits are enforced by database triggers (`durabull_assert_capacity`), so
concurrent requests, Better Auth invitation endpoints and any future write path share one boundary.

## Configuration

Set on the Cloud API only (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DURABULL_BILLING_ENABLED` | Turns Cloud billing on. Startup fails if combined with authless/env-connection mode, missing Stripe keys or prices, a non-https `APP_BASE_URL` in production, or a live key outside production. |
| `DURABULL_BILLING_ENFORCEMENT` | `off`, `shadow` (default), `pilot`, `on`. Shadow records `feature_denied` with `shadow=true` and never denies. |
| `DURABULL_BILLING_PILOT_ORG_IDS` | Organizations enforced while in `pilot`. |
| `DURABULL_BILLING_PURCHASES_ENABLED` | `false` stops new Checkout sessions (rollback switch). Webhooks keep reconciling. |
| `DURABULL_BILLING_TRIALS_ENABLED` | Disables the 14-day Business trial if Stripe trial support changes. |
| `DURABULL_BILLING_LAUNCH_AT`, `DURABULL_BILLING_MIGRATION_GRANT_UNTIL` | Beta transition grant for organizations created before launch (must be ≥ 30 days). |
| `STRIPE_*` | Keys, webhook secret, portal configuration, current Price IDs, Enterprise product IDs. |
| `DURABULL_STRIPE_LEGACY_PRICES` | Retained Price versions so existing subscribers keep mapping after a price change. |

Pinned versions: `stripe` SDK 23.x with API version `2026-09-30.endive`
(`apps/api/src/billing/gateway.ts`). Upgrade both together and re-run the lifecycle tests against a
sandbox.

## Initial Stripe setup (sandbox first)

1. Configure business identity, support contact, statement descriptor, branding, terms and privacy
   links in the Stripe Dashboard.
2. `STRIPE_API_KEY=sk_test_… bun tooling/scripts/billing-ops.ts stripe-setup --webhook-url https://<staging-host>/api/billing/webhook`
   creates Team/Business products, monthly and annual Prices (lookup keys
   `durabull_<plan>_<interval>_<catalog-version>`) and the webhook endpoint subscribed to every event
   in `STRIPE_WEBHOOK_EVENTS`. It prints the env lines to add. Live mode requires `--live`.
3. The same command creates the Customer Portal configuration (invoice history, payment methods,
   billing details, switching among the four Team/Business Prices with `always_invoice` proration,
   cancellation at period end with reasons) and a card-only payment method configuration for
   Checkout, and prints `STRIPE_PORTAL_CONFIGURATION_ID` / `STRIPE_PAYMENT_METHOD_CONFIGURATION_ID`.
   With flexible billing (the pinned API version) a Portal cancellation sets `cancel_at` rather than
   `cancel_at_period_end`; Durabull treats either as a scheduled cancellation.
   Stripe only schedules period-end downgrades between Prices of the same product, so cross-product
   downgrades are immediate with credit.
4. Configure Smart Retries and dunning emails. Set the terminal state after retries to **cancel**
   the subscription; Durabull's own grace is seven days from the first observed failure.
5. Configure Stripe Tax only for registered jurisdictions; Checkout collects billing address and tax
   IDs.
6. Trials: `trial_period_days` with `missing_payment_method=cancel` is verified on the sandbox
   account (trial ends with no charge and the subscription cancels).
7. Verify end to end before enforcing:
   `DURABULL_BILLING_VERIFY_DATABASE_URL=<disposable db> bun tooling/scripts/billing-sandbox-lifecycle.ts`
   runs the lifecycle scenarios with Stripe test clocks (refuses live keys).

## Rollout

1. Deploy with `DURABULL_BILLING_ENABLED=true`, `DURABULL_BILLING_ENFORCEMENT=shadow`. The sweep
   backfills entitlements for every organization (applying the migration grant to organizations
   created before launch).
2. Inspect who would be restricted: `bun tooling/scripts/billing-ops.ts status` and PostHog
   `feature_denied` events with `shadow=true`.
3. Send the beta-transition notice (≥ 30 days). Each owner sees the proposed plan and the exact
   resources Free would restrict in Settings → Billing.
4. Switch to `pilot` for selected organizations, verify real invoices and feature access, then run a
   full renewal / failed-payment simulation with Stripe test clocks.
5. Switch to `on`.

Rollback: set `DURABULL_BILLING_PURCHASES_ENABLED=false` (stops new purchases, keeps known paid
access and ingestion), or `DURABULL_BILLING_ENFORCEMENT=shadow` (stops denials; suspensions are
lifted on the next materialization). **Never disable the webhook endpoint as a rollback.** If a
charge is wrong, fix it in Stripe and reconcile; editing local plan rows does not change an invoice.

## Monitoring

The API logs `[billing] ALERT …` lines for:

- dead-lettered webhook events (after 10 attempts with exponential backoff up to 1 hour);
- webhook processing lag above 15 minutes;
- duplicate live base subscriptions for one organization;
- unmapped Stripe Prices;
- an organization entering degraded (unverified) billing state;
- scheduled reconciliation failures (every 6 hours).

Route these to the on-call alerting channel.

Review weekly during the pilot: revenue and failed payments. Monthly: delivery cost and support
demand. Quarterly: price and package changes.

## Common procedures

| Task | Command |
| --- | --- |
| Inbox and plan summary | `bun tooling/scripts/billing-ops.ts status` |
| Failed / dead-lettered events | `bun tooling/scripts/billing-ops.ts events --failed` |
| Retry an event | `bun tooling/scripts/billing-ops.ts retry evt_…` |
| Force reconciliation | `bun tooling/scripts/billing-ops.ts reconcile <org-id>` (or `--all`) |
| Customer lookup | `bun tooling/scripts/billing-ops.ts lookup <org-id>` or `lookup cus_…` |
| Enterprise contract limits | `bun tooling/scripts/billing-ops.ts contract <org-id> --limits '{"connections.enabled":60}'` |
| Extend a beta grant | `bun tooling/scripts/billing-ops.ts migration-grant <org-id> 2027-01-15T00:00:00Z` |

### Wrongly locked customer

1. `lookup <org-id>`: check the current subscription status, `latest_invoice_paid`, the entitlement
   `source`/`notices`, and suspensions.
2. `reconcile <org-id>`. Most locks are stale projections and clear here.
3. If Stripe state is wrong, fix it in Stripe (pay the invoice, correct the Price) and reconcile again.
4. Only if the customer must be unblocked before the root cause is fixed, grant a time-boxed override:
   `override grant <org-id> team --reason "INC-123 portal bug" --by <you> --expires <ISO>`. Overrides
   always need an owner, reason and expiry, are kept as audit records after revocation, and must be
   revoked (`override revoke <id> --by <you>`) once resolved. No permanent invisible exceptions.

### Refunds and disputes

Refund through the Stripe Dashboard. A refund does not cancel the subscription; cancel separately if
intended. First-purchase refund policy: 14 days, first payment only. `charge.refunded` and dispute
events log a `REVIEW` line and trigger reconciliation.

### Organization deletion

Better Auth refuses to delete an organization with a live subscription. The owner must cancel and
wait for the period to end (or support cancels immediately in Stripe), so subscriptions are never
orphaned.

### Duplicate subscriptions

Prevented by the single open Checkout attempt per organization, Stripe idempotency keys, a
reconcile-before-checkout preflight, and routing existing subscribers to the Portal. If the ALERT
fires, cancel and refund the newer subscription in Stripe, then reconcile.

## Lifecycle reference

| Observed state | Effective access |
| --- | --- |
| No subscription | Free |
| Trialing (before trial end) | Business trial |
| Active, paid | Mapped plan |
| Active, upgrade invoice unpaid | Last paid plan |
| First payment incomplete/expired | Free |
| Past due after a paid period | Last paid plan for 7 days, then Free (no capacity window) |
| Cancel at period end | Paid plan until period end, then Free |
| Trial ended without payment method | Free |
| Invoiced Enterprise (`send_invoice`) | Contract plan per agreement |
| Period ended, no fresh evidence | Verified plan for 24 hours, then degraded (no new capacity grants) |
| Unknown Price | Last paid plan for 24 hours (degraded), never a new premium grant |
| Active operator override | Override plan until expiry |

Downgrades keep existing excess resources for one 7-day adjustment window (not extended by repeated
cycles; none after grace). Then the owner's selection or the deterministic policy (owner pinned,
oldest kept) suspends the rest. Suspension never deletes records or touches customer Redis data.
History visibility shortens immediately; stored samples are kept 7 days before pruning.

## Known limitations

- Service-account bearer tokens and Better Auth access tokens are cached for up to 60 seconds after
  revocation or rotation (`createMcpTokenValidationCache`).
- Commercial capacity is enforced in Postgres. The MCP/API rate limiters remain in-memory per replica
  and are not commercial quotas.
- SAML SSO, SCIM, guaranteed audit completeness, private networking and SLAs are not built; do not
  sell them as included.

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
| `DURABULL_BILLING_ENABLED` | Turns Cloud billing on; plan limits are enforced whenever it is on. Startup fails if combined with authless/env-connection mode, missing Stripe keys or prices, a non-https `APP_BASE_URL` in production, or a live key outside production. |
| `DURABULL_BILLING_PURCHASES_ENABLED` | `false` stops new Checkout sessions (rollback switch). Webhooks keep reconciling. |
| `DURABULL_BILLING_TRIALS_ENABLED` | Disables the 14-day Business trial if Stripe trial support changes. |
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
   Durabull sends no email of its own for failed payments, trials about to end, renewals or
   receipts: in the app these appear as a banner and on Settings → Billing, which only reaches
   owners who sign in. In the Stripe Dashboard turn on the customer emails for failed payments,
   expiring cards, trial-ending reminders and upcoming renewals (Billing settings →
   Subscriptions and emails) and for successful payments (Customer emails), so an owner who is
   not in the app still hears about them.
5. Configure Stripe Tax only for registered jurisdictions; Checkout collects billing address and tax
   IDs.
6. Trials: `trial_period_days` with `missing_payment_method=cancel` is verified on the sandbox
   account (trial ends with no charge and the subscription cancels).
7. Verify end to end after any Stripe or catalog change:
   `DURABULL_BILLING_VERIFY_DATABASE_URL=<disposable db> bun tooling/scripts/billing-sandbox-lifecycle.ts`
   runs the lifecycle scenarios with Stripe test clocks (refuses live keys).

## Rollback

Set `DURABULL_BILLING_PURCHASES_ENABLED=false` to stop new purchases while keeping known paid access
and ingestion. Turning `DURABULL_BILLING_ENABLED` off stops all plan enforcement: at startup the API
marks every stored entitlement unenforced and lifts its suspensions. **Never disable the webhook endpoint as a rollback.** If a
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

## Common procedures

| Task | Command |
| --- | --- |
| Inbox and plan summary | `bun tooling/scripts/billing-ops.ts status` |
| Failed / dead-lettered events | `bun tooling/scripts/billing-ops.ts events --failed` |
| Retry an event | `bun tooling/scripts/billing-ops.ts retry evt_…` |
| Force reconciliation | `bun tooling/scripts/billing-ops.ts reconcile <org-id>` (or `--all`) |
| Customer lookup | `bun tooling/scripts/billing-ops.ts lookup <org-id>` or `lookup cus_…` |
| Enterprise contract limits | `bun tooling/scripts/billing-ops.ts contract <org-id> --limits '{"connections.enabled":60}' --reason "<agreement ref>" --by <you>` |

### Wrongly locked customer

1. `lookup <org-id>`: check the current subscription status, `latest_invoice_paid`, the entitlement
   `source`/`notices`, and suspensions.
2. `reconcile <org-id>`. Most locks are stale projections and clear here.
3. If Stripe state is wrong, fix it in Stripe (pay the invoice, correct the Price) and reconcile again.
4. Only if the customer must be unblocked before the root cause is fixed, grant a time-boxed override:
   `override grant <org-id> team --reason "INC-123 portal bug" --by <you> --expires <ISO>`. Overrides
   always need an owner, reason and expiry, are kept as audit records after revocation, and must be
   revoked (`override revoke <id> --reason "<why>" --by <you>`) once resolved. Every manual change is recorded in `billing_operator_action`. No permanent invisible exceptions.

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

## What customers see

- `GET /api/billing/entitlement` is the small plan lookup every signed-in page uses: features,
  limits, usage, paused resources, subscription status and whether the caller can manage billing.
  The web app reads it through `useEntitlement()` to gate controls before a request is made; the
  server routes and database triggers remain the boundary. `GET /api/billing` is the full overview
  for Settings → Billing only.
- A banner in the app shows the most urgent plan state: a failed payment or lapsed plan and a
  trial about to end (owners only), paused resources and an open adjustment window (everyone).
- `GET /api/billing/invoices` (owners) lists the twelve most recent Stripe invoices with hosted
  and PDF links; Settings → Billing shows them without leaving the app. A Stripe failure returns
  502 `invoices_unavailable` and the page points to Manage billing instead.
- `POST /api/billing/portal` takes an optional `intent` (`payment_method`, `cancel`,
  `change_plan` with a target `plan`/`interval`) and opens the Portal on that step. When the
  subscription cannot take that flow (already ending, invoiced, or Stripe rejects it) the plain
  Portal opens instead, so the buttons never dead-end.
- Paused resources come back without anyone choosing them as soon as room exists: after an
  upgrade, and after an owner or admin deletes or disables another resource, removes a member, or
  cancels an invitation (`rebalanceCapacity`). The hourly sweep repeats this for seats freed by a
  member leaving or an invitation expiring, and removes pause records for resources that no
  longer exist or no longer count.
- Alert rules on a paused or disabled connection are paused with it and do not use the plan's
  rule allowance. They can still be listed and deleted, because a connection can only be deleted
  once its rules are.
- A member whose seat is paused sees a page that says so and who to ask; an invitee who cannot
  be seated gets `invitation_suspended` or `invitation_seat_unavailable` with the same guidance.

## Known limitations

- Two invitations created at the same moment for the last free seat: the database trigger rejects
  the second inside Better Auth, which reports it as a generic failure rather than the plan-limit
  response. Retrying shows the normal limit message.

- Entitlement snapshots are cached per replica for up to 15 seconds; another replica can serve the
  previous plan for that long after a change.
- Payment grace starts when Durabull first observes the failed payment, so webhook delay lengthens
  grace by the same amount.
- Checkout does not enable Stripe Tax (`automatic_tax`). Turning on tax collection needs a code
  change and a Checkout/Portal configuration update, not only Stripe dashboard settings.
- If a Portal upgrade's prorated payment fails, the organization keeps its paid plan through
  payment grace and then drops to Free rather than back to the lower paid plan. Verify Stripe's
  behaviour for failed Portal upgrades in the sandbox before relying on it.

- Service-account bearer tokens and Better Auth access tokens are cached for up to 60 seconds after
  revocation or rotation (`createMcpTokenValidationCache`).
- Commercial capacity is enforced in Postgres. The MCP/API rate limiters remain in-memory per replica
  and are not commercial quotas.
- SAML SSO, SCIM, guaranteed audit completeness, private networking and SLAs are not built and are
  not part of any plan.

# Stripe Subscription Billing Plan

## Goal

Add self-serve Stripe subscription billing for Durabull Cloud while keeping local and self-hosted deployments free of billing enforcement. Billing is organization-scoped, not user-scoped.

The launch model should be low-friction:

- Real Free tier.
- Low-cost paid plans.
- Generous seats.
- Card-free 14-day paid-plan trials.
- Environment, connection, monitored queue, alert, and bandwidth guardrails.
- No job count or job retention limits.
- One-week payment grace before paid account lockout.
- Stripe-hosted UI and Better Auth Stripe integration wherever practical.
- Duplicate Redis connection protection so users cannot reset trials by creating new organizations with the same Redis connection string.

## Key Product Decisions

- Billing applies only to Durabull-hosted cloud mode.
- Local development and self-hosted production bypass all plan checks.
- New organizations start on Free immediately.
- Paid plans can be trialed for 14 days without a payment method.
- If a paid trial expires without a payment method, automatically fall back to Free when usage fits Free limits.
- If trial-expired usage exceeds Free limits, lock paid surfaces and explain what must be removed or upgraded.
- Active paid customers can be past due for one week before lockout.
- There is no Enterprise plan.
- Business is the highest public plan and should feel enterprise-grade without requiring sales.
- Cloud billing mode and authless mode are mutually exclusive; the API must refuse to boot if both flags are set.
- A boot-time kill switch (`DURABULL_BILLING_FORCE_UNLOCK=true`) makes `assertBillingAccess` always allow, for incident response. Its activation must emit a startup warning log line and a daily reminder.

## Existing-Organization Grandfathering (Launch Day Policy)

Production already has organizations whose usage exceeds Free limits. They must not be locked at deploy time.

On the first cloud billing deploy, a one-time migration must:

1. Insert an `organization_billing_state` row for every existing organization.
2. Set `access_state = 'trialing'`, `last_checked_status = 'grandfathered_trial'`, `grace_ends_at = deploy_time + 30 days`.
3. Email each org's owner with the grandfather notice and a link to start a real paid trial or downgrade explicitly to Free.
4. After 30 days, a scheduled reconciliation transitions any grandfathered org that has not subscribed to:
   - Free if current usage fits Free.
   - `locked` with a clear UI explaining the cleanup path if it does not.

No card is collected for the grandfather period. The state behaves like a regular trial for access purposes but does not write to Stripe.

## Why `stripeCustomerId` Belongs On Organization

Durabull billing is an organization concern. The Stripe Customer maps to `organization`, not `user`.

For Durabull:

- `organization.stripeCustomerId` is populated lazily at first `subscription.upgrade`.
- All subscription operations pass `customerType: "organization"` and `referenceId = organization.id`.
- No user-scoped subscription flows are exposed.
- `user.stripeCustomerId` exists in the schema (Better Auth Stripe always adds it) but is **never populated and never used**. `createCustomerOnSignUp` is explicitly `false`.

This prevents accidental user-billing semantics from leaking into a multi-user organization product. The `authorizeReference` callback enforces that only org owners/admins can mutate subscriptions for a given `referenceId`.

## Current Codebase Fit

Relevant current files:

- API composition: `apps/api/src/app.ts`.
- Auth route forwarding to Better Auth: `apps/api/src/routes/auth.ts`.
- Session and organization context: `apps/api/src/middleware/auth.ts`.
- Connection ownership middleware: `apps/api/src/middleware/connection.ts`.
- Better Auth configuration: `packages/auth/src/index.ts`.
- Better Auth client: `packages/auth/src/client.ts`.
- Organization schema: `packages/dal/src/db/schemas/organization/schema.ts`.
- Redis connection schema: `packages/dal/src/db/schemas/redis-connection/schema.ts`.
- Redis connection repository: `packages/dal/src/repositories/redis-connection.ts`.
- Alert monitor background loop: `apps/api/src/lib/alert-monitor.ts`.
- Org setup UI: `apps/web/src/routes/setup-organization.tsx`.
- App shell and navigation: `apps/web/src/routes/__root.tsx`.
- Connections UI: `apps/web/src/routes/$orgSlug.connections.tsx`.
- Team UI: `apps/web/src/routes/$orgSlug.team.tsx`.

Important existing constraints:

- `redis_connection.url` is encrypted.
- Redis URL encryption uses random IVs, so ciphertext cannot be compared for duplicate detection.
- Background alert evaluation bypasses HTTP middleware, so billing lockout must be applied there explicitly in cloud billing mode.
- Better Auth already owns `/api/auth/*`, so the Better Auth Stripe plugin can naturally expose `/api/auth/stripe/webhook` and subscription endpoints.

## Pricing And Packaging

### Free

`$0/mo`

- 10 seats included.
- 1 environment.
- 1 Redis connection.
- 5 monitored queues.
- 3 alert rules.
- Email alerts only.
- 5 GB/month included Durabull API/websocket transfer.
- No job count limit.
- No job retention limit.

Purpose: evaluation, hobby use, small internal tools, and a graceful landing place after a paid trial expires.

### Starter

`$12/mo` or `$120/year`

- 25 seats included.
- 2 environments.
- 3 Redis connections total.
- 25 monitored queues.
- 10 alert rules.
- Email and basic Slack alerts.
- 50 GB/month included Durabull transfer.
- No job count limit.
- No job retention limit.

Purpose: small production teams with two environments, such as staging and production.

### Team

`$39/mo` or `$390/year`

- 100 seats included.
- 3 environments: development, staging, production.
- 10 Redis connections total.
- 150 monitored queues.
- 50 alert rules.
- Email, Slack, webhook, PagerDuty/Opsgenie-style destinations as integrations mature.
- 250 GB/month included Durabull transfer.
- RBAC/team administration surfaces.

Purpose: default production plan.

### Business

`$99/mo` or `$990/year`

- 250 seats included.
- 3 current environments plus future custom environment labels if supported.
- 25 Redis connections.
- 500 monitored queues.
- 250 alert rules.
- 1 TB/month included Durabull transfer.
- Advanced RBAC, audit log, SSO-ready packaging when supported.
- Priority support language.

Purpose: larger operational teams without a sales-assisted enterprise motion.

## What Not To Meter

Do not meter:

- Job count.
- Job retention.
- Job states stored in customer Redis.

Durabull is not paying for the customer’s BullMQ job storage. The customer’s Redis instance owns that cost.

Do meter or limit:

- Durabull-hosted API/websocket transfer.
- Number of configured environments.
- Redis connections.
- Monitored queues.
- Alert rules.

Bandwidth should be generous and non-punitive:

- Warn at 75%, 90%, and 100%.
- Continue service through the current month unless there is obvious abuse.
- If a customer exceeds transfer for two consecutive months, ask them to upgrade.
- Do not add automatic bandwidth overage billing in phase 1.

## Better Auth Stripe Integration

Use `@better-auth/stripe` as the primary Stripe integration unless implementation testing exposes a blocker (see Verification Spike).

### Version Pinning

Pin both:

- `stripe@^22.0.0` in `apps/api` and `packages/auth` dependencies.
- Stripe API version `2026-03-25.dahlia` in the Stripe client constructor.

`@better-auth/stripe` must be pinned to the exact version verified against installed `better-auth@^1.4.9` during the implementation spike.

### Plugin Registration Conditions

The Stripe plugin is registered in `createAuth()` **only when**:

```
env.DURABULL_CLOUD === true &&
env.DURABULL_BILLING_ENABLED === true &&
env.DURABULL_AUTHLESS !== true
```

If any check fails, no Stripe plugin is added to the Better Auth instance. This guarantees:

- Self-hosted/local/authless deployments never expose `/api/auth/stripe/webhook` or any subscription endpoint.
- The auth handler returns the standard Better Auth 404 for unmounted plugin routes in non-cloud modes.

If `DURABULL_CLOUD` is true but `DURABULL_AUTHLESS` is also true, the API must throw at boot with a descriptive error and refuse to start.

### Plugin Order

Plugin order in `createAuth()` must be:

```
plugins: [
  organization({ ... }),
  ...(cloudBillingEnabled ? [stripe({ ... })] : []),
]
```

The organization plugin must be registered **before** the Stripe plugin so the Stripe plugin can extend the organization schema correctly.

### Plugin Configuration

```
stripe({
  stripeClient,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  createCustomerOnSignUp: false, // never create user customers
  subscription: {
    enabled: true,
    plans: [...], // see Plan Limits
    authorizeReference: async ({ user, referenceId, action }) => {
      // covers all four documented actions:
      // 'upgrade-subscription' | 'cancel-subscription' | 'restore-subscription' | 'list-subscription'
      const m = await memberRepository.findByUserAndOrg(user.id, referenceId)
      return m?.role === 'owner' || m?.role === 'admin'
    },
    getCheckoutSessionParams: async ({ plan }) => ({
      params: {
        payment_method_collection: 'if_required',
        subscription_data: { trial_period_days: 14 },
      },
    }),
    onSubscriptionComplete: ...,
    onSubscriptionCreated: ...,
    onSubscriptionUpdate: ...,
    onSubscriptionCancel: ...,
    onSubscriptionDeleted: ...,
  },
  organization: { enabled: true },
  onEvent: async (event) => { /* Durabull-specific events, idempotent by event.id */ },
})
```

`createCustomerOnSignUp` is explicitly `false`. `user.stripeCustomerId` exists in the schema (added by the plugin) but is never populated or used. Org-scoped Stripe Customers are created lazily at first `subscription.upgrade`.

### Lifecycle Hooks

Use the plugin's actual hooks; do not invent names:

| Hook | When it fires | Durabull use |
|------|----------------|---------------|
| `onSubscriptionComplete` | Checkout completed and subscription persisted | Promote `organization_billing_state` to `trialing` or `active` |
| `onSubscriptionCreated` | Subscription created outside Checkout (Stripe Dashboard) | Reconcile to active |
| `onSubscriptionUpdate` | Any subscription change webhook | Re-project state |
| `onSubscriptionCancel` | Cancellation requested (period-end or immediate) | Set banner copy |
| `onSubscriptionDeleted` | Subscription fully deleted in Stripe | Lock or downgrade-to-Free per policy |
| `freeTrial.onTrialStart` | Trial begins | Email + analytics event |
| `freeTrial.onTrialEnd` | Trial ends with conversion | No-op (handled by subscription update) |
| `freeTrial.onTrialExpired` | Trial ends without conversion | Apply downgrade-to-Free or lock |

Card-free trial fallback logic (downgrade to Free if usage fits, otherwise lock) belongs in `onTrialExpired`, not `onTrialEnd`. This is the critical distinction.

### `onEvent` Use

Wire `onEvent` for non-subscription Stripe events that Durabull-specific policy reads:

- `invoice.paid`
- `invoice.payment_failed`
- `invoice.finalization_failed`
- `invoice.payment_action_required`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.trial_will_end`

Every `onEvent` handler must be idempotent: check `event.id` against `organization_billing_state.last_processed_stripe_event_id` (or a small `stripe_event_log` table) and skip duplicates.

### `authorizeReference` Surface

The callback must explicitly handle all four documented actions:

- `upgrade-subscription`
- `cancel-subscription`
- `restore-subscription`
- `list-subscription`

For each: the user must be an org `owner` or `admin` in `referenceId`.

### Card-Free Trial Mechanics

Required Checkout behavior the implementation must guarantee:

- `payment_method_collection=if_required` on the Checkout Session.
- 14-day trial via the plugin's `freeTrial.days`.
- Stripe sends `customer.subscription.paused` when the trial expires without a payment method.
- Stripe Customer Portal is used for payment method updates, invoice history, plan changes, and cancellation.

If the Verification Spike (rollout step 0) finds that `payment_method_collection=if_required` cannot be set through `getCheckoutSessionParams` for the Better Auth plugin's Checkout path, or that the pause flow does not fire as expected, fall back to:

- A small custom Checkout-start endpoint that creates the Stripe Checkout Session directly with the required parameters.
- Better Auth Stripe still owns subscription storage, the Customer Portal session, and webhook processing.

### Trial Across Plan Switching

Decision: trial users who switch plans (Team → Business mid-trial) keep their existing trial countdown. Implementation must pass the existing `subscriptionId` to `subscription.upgrade` and verify Stripe preserves `trial_end`.

### Organization Deletion

Better Auth Stripe blocks organization deletion when an active subscription exists. The team UI and any future delete-org flow must surface this constraint with clear copy: "Cancel your active subscription before deleting this organization."

### Built-In Trial Abuse Prevention

The plugin includes per-`referenceId` trial-abuse prevention: once an org has had any trial, future trial requests return zero trial days. This is a useful first layer but is **not sufficient** on its own, because a user can create a new organization and get a fresh trial. The Duplicate Redis Connection fingerprint check (below) is the second, required layer.

## Stripe Dashboard Setup

Create Stripe Products and Prices:

- Starter monthly/yearly.
- Team monthly/yearly.
- Business monthly/yearly.

Free is not a Stripe subscription in phase 1.

Configure Billing:

- Customer Portal with payment method management, invoices, plan changes (monthly ↔ yearly within and across plans), and cancellation at period end.
- Tax ID collection only if needed for go-live region; otherwise defer to phase 2.
- Trial ending reminder 3 days before trial end.
- Payment failed email sent immediately.
- Revenue recovery emails during the 7-day grace window.
- Smart Retries (or equivalent custom retries) bounded to one week so retry exhaustion aligns with Durabull's grace policy.
- Set `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` env var only if the default Portal configuration needs deviation (e.g. enforcing specific plan groups).

After final retry, Stripe may move the subscription to `unpaid` or leave it `past_due`. Durabull's `onSubscriptionUpdate` + access-state resolver derives the user-facing state; lockout fires at `grace_ends_at`.

### Stripe Emails vs Durabull Emails

Phase 1 relies on Stripe-owned customer emails for monetary events (trial ending, payment failed, recovery, receipts). Durabull-side email through `@durabull/email` is reserved for non-monetary events that Stripe does not send:

- Grandfather period started / ending soon.
- Auto-downgrade to Free notice.
- Auto-lock notice when usage exceeds Free at trial end.
- Approaching plan limits (75/90% of bandwidth).

These Durabull emails are scoped behind `isEmailConfigured()` and are no-ops when the email service is not provisioned.

## Data Model

### Better Auth Stripe Schema (Owned by the Plugin)

Better Auth Stripe owns these schema changes. Run `npx auth generate` and check the produced Drizzle migrations into `packages/dal/src/db/migrations/`:

- Adds `user.stripeCustomerId` (nullable, unused — see plugin configuration).
- Adds `organization.stripeCustomerId` (nullable, populated lazily at first `subscription.upgrade`).
- Adds a new `subscription` table with the documented fields: `plan`, `referenceId`, `stripeCustomerId`, `stripeSubscriptionId`, `status`, `periodStart`, `periodEnd`, `cancelAtPeriodEnd`, `cancelAt`, `canceledAt`, `endedAt`, `seats`, `trialStart`, `trialEnd`, `billingInterval`, `stripeScheduleId`.

Do not define a parallel `durabull_subscription` table. The plugin's `subscription` table is the source of truth for Stripe state. Durabull state lives in `organization_billing_state` (below).

### Durabull Billing State

Add `organization_billing_state` for Durabull-only policy:

- `organization_id` primary key, `references(organization.id, { onDelete: 'cascade' })`.
- `access_state`: `free | trialing | grandfathered_trial | active | past_due_grace | locked`.
- `free_started_at`.
- `past_due_started_at`.
- `grace_ends_at` (also used for grandfathered trial end).
- `access_locked_at`.
- `bandwidth_period_start` (always the first second of the current UTC month).
- `bandwidth_period_end` (first second of the next UTC month).
- `bandwidth_bytes_used`.
- `bandwidth_warning_sent_at`.
- `last_checked_subscription_id`.
- `last_checked_status`.
- `last_synced_at`.
- `last_processed_stripe_event_id` (for `onEvent` idempotency).
- `metadata` (jsonb; used for support-tool audit entries such as claim transfers).
- `created_at`, `updated_at`.

Bandwidth period is calendar month UTC for every plan (paid orgs and Free alike) because Free has no Stripe subscription anniversary to align to. Period rolls over via a scheduled cron at month boundary.

Do not create a duplicate generic Stripe webhook table — the plugin handles its own webhook idempotency. If `onEvent` handlers need cross-event dedupe beyond `last_processed_stripe_event_id`, add a small `stripe_event_log(event_id PK, processed_at)` table.

### Backfill Behavior

The `organization_billing_state` row for an existing organization is inserted in two cases:

1. **One-time migration at first cloud-billing deploy** — see "Existing-Organization Grandfathering" above. Every existing org gets `access_state = 'trialing'`, `last_checked_status = 'grandfathered_trial'`, `grace_ends_at = deploy_time + 30 days`.
2. **Lazy upsert on first request** for any org that lacks a row after deploy (e.g. new orgs). Insert `access_state = 'free'`, `free_started_at = now`.

### Plan Limits

Create a centralized plan config in a new `@durabull/billing` package:

- `local` / `self_hosted`: unlimited, `billing.enforced = false`.
- `free`: 1 environment, 1 connection, 5 queues, 3 alert rules, 10 seats, 5 GB transfer.
- `starter`: 2 environments, 3 connections, 25 queues, 10 alert rules, 25 seats, 50 GB transfer.
- `team`: 3 environments, 10 connections, 150 queues, 50 alert rules, 100 seats, 250 GB transfer.
- `business`: 3+ environments, 25 connections, 500 queues, 250 alert rules, 250 seats, 1 TB transfer.
- `grandfathered_trial`: derived per-org from the org's pre-launch usage snapshot stored in `organization_billing_state.metadata`; all measured usage at launch is permitted until `grace_ends_at`.

Seats are enforced as warning-only in phase 1. Do **not** configure `seatPriceId` on any plan; Durabull does not use per-seat billing.

No plan has job count or job retention limits.

### `@durabull/billing` Package

Create a new internal package `packages/billing/` that owns:

- Plan config (limits, Stripe price ID mapping).
- The runtime billing service (`getBillingContext`, `assertBillingAccess`, `assertPlanLimit`, `shouldProcessBackgroundBillingWork`).
- The typed billing-error envelope (see API Enforcement).
- Stripe Customer Portal session helpers.

Both `apps/api` and `apps/web` import shared types from this package so the 402 envelope shape is consistent end-to-end.

## Runtime Billing Policy

All plan checks must go through one billing runtime policy in `@durabull/billing`.

### Billing Modes

Computed once at boot:

- `cloud_billing`: `DURABULL_CLOUD === true && DURABULL_BILLING_ENABLED === true && DURABULL_AUTHLESS !== true`.
- `self_hosted`: production with `DURABULL_CLOUD !== true`.
- `local`: non-production or local development.
- `disabled`: explicit `DURABULL_BILLING_ENABLED !== true`.

Boot must throw if `DURABULL_CLOUD === true && DURABULL_AUTHLESS === true`.

### Kill Switch

When `DURABULL_BILLING_FORCE_UNLOCK === true`, `assertBillingAccess` always allows and `assertPlanLimit` always returns `ok`. The mode log line at boot must include `BILLING_FORCE_UNLOCK=ACTIVE`, and a recurring warning (every 6h) must log while the flag is set. Bandwidth accounting still runs; only enforcement is suppressed.

### What `cloud_billing` Enforces

Only `cloud_billing` enforces:

- Subscription status.
- Plan limits.
- Dunning lockout.
- Bandwidth warnings.
- Stripe lifecycle state.
- Billing-based alert monitor filtering.

### Behavior in Non-Cloud Modes

For `self_hosted`, `local`, and `disabled`:

- Return a synthetic unlimited plan.
- Set `billing.enforced = false`.
- Allow all plan gates.
- Do not register the Stripe plugin in Better Auth.
- Do not mount `/api/billing/*` routes.
- Do not create Stripe Customers, Checkout Sessions, Customer Portal sessions, or subscription rows.
- Do not return `402`.
- Do not filter alert monitor work for billing.
- Hide or de-emphasize paid upgrade UI in the web app.

### Central Service Methods

- `getBillingContext(organizationId): BillingContext` — pure projection of state for a single org.
- `assertBillingAccess(context): void | throws PaymentRequiredError`.
- `assertPlanLimit(context, limitKey, currentUsage): void | throws PlanLimitExceededError`.
- `shouldProcessBackgroundBillingWork(context): boolean`.
- `resolveStripeSubscriptionToBillingContext(orgId): Promise<BillingContext>` — re-pulls subscription + state and re-derives access; used by `/api/billing/sync` and the reconciliation cron.

Never scatter `if self-hosted` checks throughout routes. The bypass belongs in these central methods.

### Access-State Resolver

`getBillingContext` derives `access_state` from the Better Auth `subscription` row(s) for the org plus `organization_billing_state`, in this precedence order:

1. If kill switch is on → `active` (synthetic).
2. If grandfathered_trial and `now < grace_ends_at` → `trialing` (synthetic limits).
3. Subscription `status === 'trialing'` → `trialing`.
4. Subscription `status === 'active'` and not `past_due` → `active`.
5. Subscription `status === 'past_due'` and `now < grace_ends_at` → `past_due_grace`.
6. Subscription `status === 'past_due'` and `now >= grace_ends_at` → `locked`.
7. Subscription `status === 'paused'`:
   - If usage fits Free → `free` (auto-downgrade record applied).
   - Else → `locked`.
8. Subscription `status === 'unpaid' | 'canceled' | 'incomplete_expired'`:
   - If usage fits Free → `free`.
   - Else → `locked`.
9. Subscription `status === 'incomplete'` → `locked`.
10. No subscription row → `free`.

This ordering is the single source of truth for access policy. The implementation must include a unit test matrix covering every Stripe status × usage-fits-Free combination.

### Billing Error Envelope

All `402` responses use this exact shape and are exported as a TypeScript type from `@durabull/billing`:

```
{
  error: 'PaymentRequired',
  code: 'BILLING_LOCKED' | 'PLAN_LIMIT_EXCEEDED' | 'TRIAL_EXPIRED' | 'PAST_DUE_LOCKED' | 'GRANDFATHER_EXPIRED',
  message: string,
  billing: {
    state: AccessState,
    plan: 'free' | 'starter' | 'team' | 'business' | 'grandfathered_trial',
    limit?: { key: string, allowed: number, current: number },
    graceEndsAt?: string,    // ISO8601
    upgradeUrl: string,      // org-scoped billing route
    portalUrl?: string,      // billing portal session URL when available
  }
}
```

The web app's TanStack Query error normalizer recognizes this shape and routes the user to billing UI instead of showing a generic toast.

## Access Policy

Cloud billing mode only. The resolver order in "Access-State Resolver" above is canonical; this section describes the user-visible effects.

### Per-State Behavior

- `free`: limited but usable forever.
- `trialing` / `grandfathered_trial`: full selected-plan access until `trialEnd` / `grace_ends_at`.
- `active`: full paid-plan access.
- `past_due_grace`: full access with persistent banner and billing CTA.
- `locked`: see "Locked Access" below.

### Multi-Organization Users

Billing is per-organization. A user who is a member of orgs A (locked) and B (active) retains full access to B. The lock screen for A must include "Switch organization" as a primary action and must not interfere with the global Better Auth organization switcher.

### Locked Access — Allowed

- Sign in / sign out.
- Switching organizations (`POST /api/auth/organization/set-active`).
- Reading session and `/api/app/config`.
- Reading `/api/team/members` (needed for the org switcher and lock-screen UI).
- Reading `/api/billing/status`.
- All Better Auth subscription mutation endpoints (`subscription.upgrade`, `subscription.billingPortal`, `subscription.cancel`, `subscription.restore`, `subscription.list`).
- Durabull billing recovery endpoints (`/api/billing/sync`, `/api/billing/downgrade-to-free`).

### Locked Access — Blocked

- Redis connection management (create/update/delete; reads of connection list remain allowed so the UI can show what would be removed).
- Queues.
- Jobs.
- Scheduled jobs.
- Redis keys.
- Analytics.
- Workers.
- Alerts (rules and event reads).
- Team management writes (invite, role change, remove member).

Return `402 Payment Required` with the structured billing envelope (see "Billing Error Envelope") in cloud billing mode only.

### State-Transition Notes

Common Stripe transitions that must be handled:

- `trialing` → `past_due` directly when the first invoice fails after trial auto-charge.
- `paused` → `active` when a payment method is added through the Customer Portal.
- `active` → `past_due` → `unpaid` after Stripe Smart Retries exhaust.
- `past_due` → `active` when `invoice.paid` arrives.

`onSubscriptionUpdate` plus the `onEvent` handlers above must reproject `organization_billing_state` for every transition.

## Trial Flow

1. User signs up.
2. User creates organization.
3. Organization enters Free immediately (`organization_billing_state` lazily inserted).
4. App shows optional CTA: "Start a 14-day Team trial, no credit card required."
5. If owner starts a trial, call Better Auth Stripe `subscription.upgrade`:
   - `plan`: selected plan.
   - `customerType: "organization"`.
   - `referenceId`: active organization ID.
   - `successUrl`: org billing page (`/{orgSlug}/billing?from=checkout`).
   - `cancelUrl`: org billing page (`/{orgSlug}/billing?canceled=1`).
   - `seats`: informational; not used for per-seat billing.
6. `getCheckoutSessionParams` sets `payment_method_collection: 'if_required'` on the Stripe Checkout Session.
7. Better Auth creates the Checkout Session and returns the redirect URL.
8. Stripe sends webhooks to `/api/auth/stripe/webhook`.
9. Better Auth updates the `subscription` table.
10. Durabull's `onSubscriptionComplete` and `onSubscriptionUpdate` reproject `organization_billing_state`. Every handler runs through the `event.id` idempotency check before writing.
11. Web app reflects new trial status from `GET /api/billing/status`.

If Checkout is abandoned, the organization remains on Free. Better Auth Stripe creates no subscription row for an abandoned Checkout.

## Trial Expiration

When a card-free trial ends without a payment method:

1. Stripe transitions the subscription to `paused` and emits `customer.subscription.paused`.
2. The Stripe plugin invokes `freeTrial.onTrialExpired`.
3. Durabull evaluates the org's current usage against Free limits.
4. If usage fits Free:
   - Set `access_state = 'free'`.
   - Email the owner with the downgrade notice and a one-click upgrade link.
   - Show a banner in the web app.
5. If usage exceeds Free:
   - Set `access_state = 'locked'`.
   - Email the owner with the lock notice listing exact limits exceeded and required cleanup.
   - The web UI locked screen explains current usage, Free limits, the specific resources to remove, and the "add payment to resume paid plan" CTA.

Idempotency: the handler uses `event.id` deduplication so retried webhooks do not re-fire the email.

## Payment Failure Flow

When a paid renewal fails:

1. Better Auth Stripe `onEvent` receives `invoice.payment_failed`.
2. Idempotency check: skip if `event.id === last_processed_stripe_event_id`.
3. Durabull sets `past_due_started_at` if absent.
4. Durabull sets `grace_ends_at = past_due_started_at + 7 days`.
5. App shows persistent payment-failed banner.
6. Stripe Smart Retries continue.
7. If `invoice.paid` arrives before `grace_ends_at`:
   - Clear `past_due_started_at` and `grace_ends_at`.
   - Restore `active` access.
8. If `now >= grace_ends_at` (detected by `onSubscriptionUpdate`, the reconciliation cron, or any access check):
   - Transition to `locked`.

## Plan Switching During Trial

Switching plans mid-trial (Team → Business) preserves the trial countdown.

1. UI calls `subscription.upgrade({ plan: 'business', subscriptionId: existing, ... })`.
2. Better Auth Stripe updates the existing Stripe subscription in place.
3. The Stripe subscription keeps the same `trial_end`.
4. Webhook reprojects `organization_billing_state.last_checked_status`.

Verification spike must confirm Stripe preserves `trial_end` through this flow; if not, the upgrade endpoint must explicitly set `trial_end` before mutating.

## API Enforcement

### Middleware

Add three Hono middlewares in `apps/api/src/middleware/billing.ts`:

- `attachBillingContext` — reads `organizationId` from context, fetches the billing context once per request, sets `c.set('billing', context)`.
- `requireBillingAccess` — calls `assertBillingAccess`; returns the 402 envelope if locked.
- `requirePlanLimit(limitKey, getUsage)` — calls `assertPlanLimit`; returns 402 with `PLAN_LIMIT_EXCEEDED` if exceeded.

### Ordering

The exact mount order per protected prefix is:

```
session → attachBillingContext → requireOrganization → requireBillingAccess → handler
```

For per-connection routes the order is:

```
session → attachBillingContext → connectionMiddleware → requireBillingAccess → handler
```

The plan does **not** introduce a new `requireOrganizationWithBilling` wrapper. The existing `requireOrganization` is unchanged; `requireBillingAccess` is composed after it.

### Mount Targets (Exact)

Cloud billing middleware applies only on these prefixes, mounted after session/org resolution:

- `/api/connections/*` — protected.
- `/api/c/:connectionId/*` — protected.
- `/api/alerts/*` — protected (org-wide event feed and summary).
- `/api/team/invite`, `/api/team/role/*`, `/api/team/remove/*` — protected (writes only; if these routes don't exist yet, mount the middleware on the writes as they're added).

Explicitly **not** mounted on:

- `/api/auth/*` — including `/api/auth/stripe/webhook` and all subscription endpoints. Webhook delivery and recovery actions must never be locked out.
- `/api/auth/stripe/webhook` — additionally exempted from `authRateLimiter` (see below).
- `/api/billing/*` — see "API Routes" section.
- `/api/session` — needed for the locked UI.
- `/api/app/config` — needed for the locked UI.
- `/api/app/version`, `/api/health` — operational.
- `/api/team/members` (read) — needed for org switcher and locked-screen UI.

### Stripe Webhook Path — Middleware Stack

`apps/api/src/app.ts` currently rate-limits `/api/auth/*` via `authRateLimiter` (50 req / 10s per IP). The webhook path is removed from that limiter and given its own hardened middleware stack:

```
// Skip authRateLimiter for the webhook path
app.use('/api/auth/*', async (c, next) => {
  const path = c.req.path
  if (
    path.includes('/get-session') ||
    path.includes('/session') ||
    path.endsWith('/stripe/webhook')
  ) return next()
  return authRateLimiter(c, next)
})

// Webhook-specific middleware (only when cloud billing is enabled)
if (cloudBillingEnabled) {
  app.use(
    '/api/auth/stripe/webhook',
    stripeWebhookIpAllowlist,          // Layer 2
    stripeWebhookStrictShape,          // Layer 3 (POST + Content-Type + 64 KB)
    stripeWebhookRateLimiter,          // Layer 7
  )
}
```

After these checks pass, the request reaches Better Auth's handler, which runs signature verification (Layer 4), dual-secret retry (Layer 5), livemode check and idempotency (Layer 6). See **Stripe Webhook Security (Defense in Depth)** below for the full layered model.

In non-cloud modes the Stripe plugin is not registered, so the path 404s and none of these middlewares are mounted. The authless catch-all 403 is therefore never reached because cloud billing is mutually exclusive with authless mode (boot assertion).

### Body-Limit and Signature Verification

Hono's `bodyLimit(1MB)` reads `Content-Length` but does not consume the request body. `auth.handler(c.req.raw)` passes the raw `Request`. Stripe webhook signature verification (which Better Auth Stripe handles internally) must therefore work without changes. This must be covered by a test that posts a signed payload through the full middleware chain.

### Enforcement Points

- **Connection count** — check in `redisConnectionRepository.create` (DAL) via a `assertPlanLimit('connections', ...)` callback supplied by the API layer. The repository becomes billing-aware via dependency injection rather than direct env reads.
- **Environment count** — in `connections.ts` POST/PATCH handlers, count distinct environments after applying the change and call `assertPlanLimit('environments', ...)`.
- **Monitored queue count** — in queue discovery/sync (per connection).
- **Alert rule count** — in alert rule create handler.
- **Bandwidth** — see "Bandwidth Metering" below.

Seats are warning-only in phase 1. Implement as a soft warning surfaced in the team UI; do not block invites.

### Bandwidth Metering

Implementation:

- Add an outermost Hono middleware after CORS/rate-limit that wraps the response, observes `Content-Length` on the final response (or counts streamed bytes for chunked responses), and increments an in-memory per-org counter.
- A 60s timer flushes counters to `organization_billing_state.bandwidth_bytes_used` using a single batched UPDATE.
- A 1h cron evaluates each org's `bandwidth_bytes_used` against the plan's transfer limit and fires emails at 75%, 90%, 100%.
- Calendar-month rollover: a cron at the first second of each UTC month resets `bandwidth_bytes_used = 0` and advances `bandwidth_period_start` / `bandwidth_period_end`.

Excluded from bandwidth accounting:

- `/api/health`, `/api/app/version`, `/api/app/config`.
- `/api/auth/*` (Better Auth traffic).
- `/api/telemetry/*` (Durabull-side telemetry ingestion).
- `/ingest/*` (PostHog proxy — passes through, not Durabull bytes).
- Stripe webhook traffic.

Phase 1 does not implement automatic bandwidth overage billing. Two consecutive months over the limit triggers a manual outreach playbook, not enforcement.

## Stripe Webhook Security (Defense in Depth)

`/api/auth/stripe/webhook` is the only public, unauthenticated endpoint we expose for billing. A forged or replayed event could grant a free subscription, hide a failed payment, or alter access state. Treat it accordingly.

The endpoint is hardened with **seven independent layers**. Each layer can fail open without enabling the next; an attacker must break every layer to compromise billing state.

### Layer 1 — TLS, HSTS, HTTPS-Only

- The API already sets `secureHeaders({ strictTransportSecurity: 'max-age=31536000; includeSubDomains' })`.
- The infrastructure (Cloudflare/edge) must reject plain HTTP for the API hostname. Document this in the cloud runbook.
- Stripe will not deliver webhooks to non-HTTPS endpoints; the Stripe Dashboard webhook config must specify `https://` and `STRIPE_WEBHOOK_URL_PROD` must be HTTPS-only.

### Layer 2 — Source IP Allowlist

Stripe publishes the canonical webhook source IP list at `https://stripe.com/files/ips/ips_webhooks.json`.

- A new module `apps/api/src/lib/stripe-webhook-ip-allowlist.ts` fetches and caches this list on boot and refreshes every 6 hours.
- The allowlist refresh respects the response's `ETag`/`Last-Modified` and falls back to a bundled snapshot file at `apps/api/src/lib/stripe-webhook-ips.snapshot.json` if the network fetch fails.
- The webhook handler middleware rejects any request whose client IP (extracted from `x-forwarded-for` / `cf-connecting-ip` / `x-real-ip`, identical to the rate-limit key extraction) is not in the allowlist with `403 Forbidden` and **no response body**.
- This layer is defense in depth only. A request that passes IP allowlist still has to pass signature verification (Layer 4). An IP-allowlist bypass alone never trusts the payload.
- A `DURABULL_STRIPE_WEBHOOK_IP_ALLOWLIST_MODE` env var controls behavior:
  - `enforce` (default in production): reject on miss.
  - `monitor`: log and emit metric, but still call signature verification.
  - `disabled`: skip the check entirely. Reserved for local Stripe CLI testing.
- The Stripe CLI's `stripe listen` connects from local IPs that are not on the allowlist, so local development uses `monitor` or `disabled`.

### Layer 3 — Strict Request Shape

Before Better Auth's plugin sees the request, a thin middleware on `/api/auth/stripe/webhook` only:

- Method must be `POST`. Anything else returns `405 Method Not Allowed` with no body.
- `Content-Type` must start with `application/json`. Otherwise `400`.
- `Stripe-Signature` header must be present. Otherwise `400`.
- Request body length must be ≤ `64 KB` (vs. the global 1 MB body limit). Stripe webhook payloads are well under this in practice; this prevents amplified DoS through the signature-verification CPU cost.

These checks fail fast with no expensive work and no information disclosure.

### Layer 4 — Cryptographic Signature Verification

This is the only layer that authorizes the payload. Better Auth Stripe's plugin internally calls `stripe.webhooks.constructEventAsync` with:

- The raw request body (preserved because Hono's `bodyLimit` does not consume the body and the auth handler receives `c.req.raw`).
- The `Stripe-Signature` header.
- `STRIPE_WEBHOOK_SECRET`.
- Default replay tolerance of 300 seconds. Plan does not extend this.

Implementation requirements:

- Never log the raw body or the `Stripe-Signature` header.
- Never trim, normalize, or re-encode the body before signature verification. The plan's API Enforcement section already commits to this; the webhook tests verify it.
- Signature failures must return `400` with body `Webhook signature verification failed` (Stripe ignores body content on non-2xx; this exact string aids debugging).
- Every signature failure increments a metric `stripe_webhook_signature_failures_total` and emits a structured log line with the source IP only (no body, no header, no event content).
- More than 5 signature failures from any single IP in 60 seconds fires a security alert.

### Layer 5 — Dual-Secret Rotation

A leak of `STRIPE_WEBHOOK_SECRET` is the highest-impact compromise. Stripe supports rolling secrets; the implementation supports it:

- `STRIPE_WEBHOOK_SECRET` is the primary.
- `STRIPE_WEBHOOK_SECRET_NEXT` is optional. When set, the webhook handler attempts signature verification against the primary first; on failure, it retries against `_NEXT`. Both passes use constant-time comparison via the Stripe SDK.
- Rotation procedure (documented in the cloud runbook):
  1. Add a new signing secret in the Stripe Dashboard for the same endpoint.
  2. Set `STRIPE_WEBHOOK_SECRET_NEXT` to the new secret in production env.
  3. Wait for at least 24 hours so all in-flight deliveries land on the new secret.
  4. Remove the old secret from Stripe Dashboard.
  5. Promote `STRIPE_WEBHOOK_SECRET_NEXT` to `STRIPE_WEBHOOK_SECRET` and unset `_NEXT`.
- A boot-time assertion warns (does not fail) if `_NEXT` has been set for more than 14 days, to prevent stale rotation state.

### Layer 6 — Event Replay and Idempotency

Even a fully verified event could be a replay of a real older event captured by a man-in-the-middle (theoretical given TLS; practical only if a downstream proxy logs the body).

- Stripe's signature tolerance of 300 seconds already bounds the replay window.
- Beyond that, every `onEvent` and lifecycle handler dedupes on `event.id` via `organization_billing_state.last_processed_stripe_event_id` (or the `stripe_event_log` table). Duplicate event IDs from the same subscription are no-ops.
- Test mode and live mode events are never mixed: production validates `event.livemode === true` and rejects test events with `400`. Test mode (Stripe CLI, staging) does the inverse. This prevents an attacker with test-mode access from injecting events into a live system.

### Layer 7 — Dedicated Rate Limiter

The webhook path is exempt from `authRateLimiter` (which would block Stripe retries), but is **not unprotected**:

- A new `stripeWebhookRateLimiter` allows 200 req / 10 s per source IP (Stripe's documented peak delivery is well under this).
- It returns `429` on excess, signalling Stripe to retry with backoff per its standard retry semantics.
- The limiter is keyed by the same IP extraction logic as Layer 2 and is bypassed in dev/test as the existing rate limiters are.
- If the limiter is hit by an IP that also failed Layer 2's allowlist, the security alert fires immediately.

### Cross-Cutting Guarantees

- **No CORS**: the webhook is server-to-server. The existing `/api/*` CORS policy restricts allowed origins; the webhook path can also enforce no `Access-Control-Allow-Origin` because it is never called from a browser.
- **No cookies, no sessions**: the webhook handler never reads cookies and never sets them. Adding any future session middleware must explicitly skip `/api/auth/stripe/webhook`.
- **Path obscurity is not relied on**: the well-known path `/api/auth/stripe/webhook` is by design (so Better Auth and Stripe documentation match operator expectations). Security comes from signature, not obscurity.
- **Auth catch-all 403 bypass**: in production cloud mode, the Stripe plugin is registered, so `auth.handler` matches `/stripe/webhook` and the authless catch-all is never reached. In any non-cloud mode the plugin is not registered, so the path 404s.
- **Body integrity**: the verification spike (rollout step 0) includes a test that posts a known-signed payload through the full middleware stack (CORS → rate-limit-exempt → body-limit → secureHeaders → auth handler) and asserts the signature verifies. This guards against future middleware changes silently breaking the raw body.
- **Audit log**: every verified webhook writes one structured log line containing `event.id`, `event.type`, source IP, `event.livemode`, processing duration, and verified-signature flag — never the body or headers. Failed verifications log IP and reason code only.
- **No body in 5xx responses**: handler errors return `500` with body `Webhook handler error`. Detailed error context goes to the log, never the response.
- **Webhook URL secret in path (optional, deferred)**: prepending a per-environment opaque path segment (e.g. `/api/auth/stripe/webhook/<32-char-token>`) is sometimes used as a stealth layer. Phase 1 does not implement this because the seven layers above are stronger than path obscurity. Phase 2 may add it as a sealed-secret rotation drill.

### Threat Model Summary

| Threat | Layer(s) defeating it |
|--------|------------------------|
| Forged webhook from random attacker | 1, 2, 3, 4 |
| Replayed real event captured upstream | 4 (timestamp), 6 |
| Stolen `STRIPE_WEBHOOK_SECRET` | 2 (defense in depth), 5 (rotation), 7 (rate limit) |
| Cross-environment event injection (test → live) | 6 (`livemode` check) |
| Slowloris / large-body DoS | 3 (size + content-type), 7 |
| CPU-amplified signature-check DoS | 2 (IP allowlist drops first), 3, 7 |
| Browser-based attack (CSRF, XHR) | Cross-cutting (no CORS, no cookies) |
| Future middleware breaks raw body | Verification spike test, ongoing test |

If any single layer is breached, the others independently keep billing state safe.

## Background Processing

### Alert Monitor Lock Filtering

`apps/api/src/lib/alert-monitor.ts` today iterates by `connectionId` after `alertRuleRepository.findAllEnabled()`. Add a new repository method that performs the org-state filter at the database level so the monitor never opens Redis for a locked cloud org:

```
alertRuleRepository.findAllEnabledForActiveOrgs()
```

Implementation:

- Join `alert_rule` → `organization_billing_state` on `organization_id`.
- In cloud billing mode, return only rules whose org's `access_state IN ('free', 'trialing', 'grandfathered_trial', 'active', 'past_due_grace')`. Exclude `locked`.
- In non-cloud modes, behave identically to `findAllEnabled()` (no billing filter).

`runPollCycle` calls the new method via `shouldProcessBackgroundBillingWork(context)` to pick the right repository call. Per-rule re-checks are not required because the join guarantees only active orgs return rules.

### Other Background Work

Add two new periodic jobs in `apps/api/src/lib/`:

- **`billing-reconciliation.ts`** — every 10 minutes, picks orgs whose `last_synced_at` is older than 30 minutes, re-pulls their subscription from Stripe via `resolveStripeSubscriptionToBillingContext`, and reprojects state. Logs (without PII) anything where the recomputed state disagrees with the stored state.
- **`bandwidth-flusher.ts`** — every 60 seconds, drains the in-memory bandwidth counter map into the DB.

Both jobs guard their entire body with `if (billingMode !== 'cloud_billing') return` so they are no-ops in self-hosted/local/disabled deployments.

## Duplicate Redis Connection Abuse Prevention

Problem:

- Card-free trials make it easy to create a new org after a trial expires.
- Existing Redis URLs are encrypted with random IVs.
- Duplicate detection cannot compare encrypted URLs.

This system is the second of two layers — the first is Better Auth Stripe's built-in per-`referenceId` trial-abuse prevention. Both are required.

### Schema

Add `url_fingerprint` to `redis_connection`:

- `text` column, nullable until backfill completes, then `NOT NULL`.
- Value format: `fp_v1_<base64url(64 chars)>` so a future rotation can introduce `fp_v2_`.
- Indexed for lookup (`CREATE INDEX redis_connection_url_fingerprint_idx ON redis_connection(url_fingerprint)`).
- Computed as HMAC-SHA256(`DURABULL_CONNECTION_FINGERPRINT_SECRET`, canonical URL).
- Not reversible.

Add `redis_connection_claim`:

- `url_fingerprint` (text) primary key.
- `owning_organization_id` (references `organization.id`, `onDelete: 'restrict'`).
- `first_connection_id` (text — the originating connection; for forensics, not FK).
- `first_seen_at`, `last_seen_at`, `released_at` (timestamps).
- `claim_status`: `active | released | blocked`.
- `notes` (text, nullable — populated by support tool transfers).

### Bypass Conditions

The fingerprint/claim check is **bypassed entirely** in these cases (the implementation must verify each at runtime):

- `billingMode !== 'cloud_billing'`.
- `shouldUseEnvConnections() === true` (connections are admin-provisioned via env, not user-created).
- The canonical URL equals the canonicalization of `env.DURABULL_DEMO_ACCOUNT_REDIS_CONNECTION_STRING`.
- `env.DURABULL_BILLING_FORCE_UNLOCK === true`.

The bypass paths apply both to create-time claim assertion and to migration/backfill.

### Same-Org Policy

Within a single organization, a Redis URL **may** be reused across multiple connection rows (e.g. two named connections pointing at the same Redis). The claim system enforces only **cross-organization** uniqueness.

### Canonicalization

The canonical form is computed by `packages/billing/src/redis-url-canonical.ts`. It must produce the same fingerprint for any pair of URLs that ioredis would treat as connecting to the same logical Redis with the same credentials. Concrete rules:

1. **Scheme** — `redis://` (no TLS) or `rediss://` (TLS). `redis://...?tls=true` and `redis://...?ssl=true` and `redis+tls://` all normalize to `rediss://`. Any unknown variant rejects with `RedisUrlCanonicalizationError`.
2. **Host** — lowercased. Hostnames are kept as-is (no DNS lookup). IPv6 bracket notation preserved. IPs and hostnames are not unified.
3. **Port** — omitted if `6379`. Otherwise included.
4. **Database** — explicit integer `0..15`. `redis://h:6379`, `redis://h:6379/`, and `redis://h:6379/0` all normalize to db `0`. `?db=2` and `/2` both normalize to `/2`. Different db indexes on the same host **are different fingerprints**.
5. **User** — Redis 6 ACL default user. `default@`, `@`, and no user prefix all normalize to omitted user.
6. **Password** — percent-decoded then percent-encoded with a fixed RFC3986-unreserved set, so `%21` and `!` produce the same output. Passwords supplied via `?password=` are merged into the userinfo position.
7. **Query parameters** — kept only for: `db`, `family`. Everything else (`tls`, `ssl`, `password`, `username`, `name`) is consumed into normalized fields and removed from the query. Remaining params are sorted lexicographically.
8. **Sentinel / Cluster URIs** — multi-host URIs (`redis-sentinel://h1,h2/...`, `redis+cluster://...`) are explicitly rejected in phase 1 with `RedisUrlCanonicalizationError` and a user-facing error directing to single-host Redis or Sentinel resolved at the client. This avoids fingerprint ambiguity. Phase 2 may add a canonical form by sorting host list.

The canonicalizer ships with a fixture suite covering every rule above, including negative cases.

### Logging Discipline

Never log canonical URLs, raw URLs, or fingerprints in normal operation. Errors surface only org IDs and connection IDs. Test assertions verify no log line emitted during normal create/update flows contains substrings of fingerprints or URLs.

### Repository Behavior

`redisConnectionRepository.create` and `.update`:

- Validate Redis URL (existing `validateRedisUrlForEnvironment`).
- Compute canonical URL and fingerprint (skips on bypass conditions).
- In a single DB transaction:
  - Read `redis_connection_claim` for the fingerprint.
  - If no claim exists → insert claim with this org as owner, then insert connection.
  - If claim exists and `owning_organization_id === this org` → insert/update connection, bump `last_seen_at`.
  - If claim exists and `owning_organization_id !== this org` → throw `RedisConnectionDuplicateClaimError`.
- The API translates `RedisConnectionDuplicateClaimError` into `409 Conflict` with non-leaky copy:
  > "This Redis connection is already associated with another organization. Ask the owner to invite you or contact support to transfer ownership."

Deleting a connection does **not** release the claim. `claim_status` stays `active` until explicit support action.

### Migration / Backfill

The migration is run once on the first cloud-billing deploy. Behavior:

1. Assert `DURABULL_REDIS_URL_ENCRYPTION_KEY` and `DURABULL_CONNECTION_FINGERPRINT_SECRET` are set; abort with actionable error if not.
2. For each row in `redis_connection`:
   - Decrypt URL in memory only; never log it.
   - If row matches a bypass condition (env connections, demo string), skip claim insert but still write `url_fingerprint` so future logic is consistent.
   - Compute canonical form. If `RedisUrlCanonicalizationError` (e.g. existing sentinel URL), record the connection ID in the migration's structured error output and continue; do not abort.
   - Compute fingerprint.
3. Insert claims using **first-seen-wins** policy:
   - Sort all rows by `(organization.createdAt ASC, redis_connection.createdAt ASC)`.
   - First row claims the fingerprint; subsequent rows with the same fingerprint in a different org get the connection row tagged in `redis_connection_claim.notes` and the migration emits a "blocked-on-launch" structured log line with `{orgId, connectionId}` (no URL or fingerprint).
4. After all rows processed: write `url_fingerprint NOT NULL` constraint (unless `DURABULL_CONNECTION_FINGERPRINT_BACKFILL_PERMISSIVE=true` to tolerate canonicalization failures).
5. Operations review the structured output post-migration and uses the claim-release tool for any legitimate cross-org duplicates before customers notice.

### Claim-Release Support Tool

`tooling/scripts/release-redis-connection-claim.ts` (Bun script). Capabilities:

- `--list <orgId>` — lists claims owned by an org (no URL or fingerprint output).
- `--transfer <fingerprint> <newOrgId> --reason "<text>"` — transfers ownership; writes audit row into `redis_connection_claim.notes` with timestamp, operator (from `DURABULL_OPERATOR_NAME`), reason.
- `--release <fingerprint> --reason "<text>"` — sets `claim_status = 'released'`, allowing the next create to take it.

The script:

- Requires `DURABULL_BILLING_SUPPORT_TOKEN` env var to run.
- Logs every operation to `organization_billing_state.metadata` of both source and target orgs with structured audit entries.
- Is not exposed as an HTTP API in phase 1.

### Fingerprint Secret Rotation

The `fp_v1_` prefix makes a future key rotation feasible:

1. Set `DURABULL_CONNECTION_FINGERPRINT_SECRET_NEXT` to the new key while keeping the old as `DURABULL_CONNECTION_FINGERPRINT_SECRET`.
2. Run a re-key migration that writes `fp_v2_` fingerprints to a shadow column for every row.
3. Switch reads to the new column.
4. Drop the old column and rename.

Phase 1 only ships `fp_v1_`. Phase 2 ships the rotation script when needed.

## Web UI

### Route Files

This repo uses TanStack file-based routing with dot-separated file names. Add:

- `apps/web/src/routes/$orgSlug.billing.tsx` — main billing page.
- `apps/web/src/routes/$orgSlug.billing.success.tsx` — Checkout success reconciliation (handles the race between webhook arrival and redirect).

No separate `/billing/start` route is needed; the plan picker opens Checkout directly via `authClient.subscription.upgrade`.

### Components (`apps/web/src/components/billing/`)

- `SubscriptionStatusBanner` — top-of-app banner for `trialing`, `past_due_grace`, `paused`, `grandfathered_trial`, locked-imminent states.
- `BillingLockedScreen` — full-page replacement for in-app routes when `access_state === 'locked'`. Renders why-locked copy from the 402 envelope, "Add payment" CTA, "Switch organization" action, and the per-resource cleanup checklist when applicable.
- `PlanLimitNotice` — inline 402 renderer for `PLAN_LIMIT_EXCEEDED` errors.
- `PlanPicker` — calls `authClient.subscription.upgrade({ plan, customerType: 'organization', referenceId: activeOrgId, ... })`.
- `BandwidthUsageBar` — shown on the billing page only.

Use `useBillingStatus()` hook for read-only access in components.

### App Shell Wiring

- Fetch billing status alongside `/api/app/config` bootstrap so the shell can route locked orgs to `BillingLockedScreen` before mounting protected routes.
- Allow billing routes when access is locked: `$orgSlug.billing.*`, login, sign-out, org switching, and the locked screen itself.
- Show banners according to `access_state`. In `local`, `self_hosted`, or `disabled` modes, hide upgrade pressure entirely (use `config.billing.enforced === false`).
- The org switcher must remain operational at all times, including in `BillingLockedScreen`.

### Error Envelope Normalization

The TanStack Query default error handler recognizes the 402 envelope shape and:

- For `BILLING_LOCKED` / `PAST_DUE_LOCKED` / `TRIAL_EXPIRED` / `GRANDFATHER_EXPIRED` → swap the route tree to `BillingLockedScreen`.
- For `PLAN_LIMIT_EXCEEDED` → render `PlanLimitNotice` inline near the action and suppress the generic toast.

A unit test asserts that no 402 response ever produces a generic toast.

### Org Setup

- New organization goes to app on Free.
- Show optional onboarding card: "Start a 14-day Team trial, no credit card required."
- Hide the card entirely when `config.billing.enforced === false`.

### Connections / Alerts / Team UI

- Connections UI shows current connection count and environment count against plan limits; disables unavailable environment choices.
- Renders duplicate-claim 409 errors with the non-leaky copy from the API.
- Alerts UI shows alert-rule usage and links to billing at the cap.
- Team UI shows seat count and explains seats are generous and warning-only in phase 1.

### Stripe Pricing Table

Avoid Stripe's hosted Pricing Table in phase 1. The `PlanPicker` is a Durabull-controlled component because Better Auth Stripe `subscription.upgrade` requires referenceId/customerType to be passed by the client.

## API Routes

### Better Auth Stripe Routes (Plugin-Owned)

When the Stripe plugin is registered, Better Auth exposes:

- `POST /api/auth/subscription/upgrade`.
- `GET /api/auth/subscription/list`.
- `POST /api/auth/subscription/billing-portal`.
- `POST /api/auth/subscription/cancel`.
- `POST /api/auth/subscription/restore`.
- `POST /api/auth/stripe/webhook` (Stripe-only; signed).

Client calls use `authClient.subscription.*` with `customerType: 'organization'` and `referenceId: activeOrgId`.

### Durabull-Specific Billing Routes

Mounted under `/api/billing/*` (not protected by `requireBillingAccess` — these routes must remain accessible when locked):

- `GET /api/billing/status` — returns:
  - `plan: 'free' | 'starter' | 'team' | 'business' | 'grandfathered_trial'`
  - `access_state`
  - `limits` (full plan-limit map)
  - `usage` (current counts for connections, environments, queues, alert rules, members, bandwidth bytes/percent)
  - `trial: { startsAt, endsAt, daysRemaining }` when applicable
  - `grace: { startedAt, endsAt }` when applicable
  - `portalAvailable: boolean`
  - `billing.enforced: boolean`
- `POST /api/billing/sync` (owner/admin only, rate-limited to 1 call / 60s per org):
  - Calls `resolveStripeSubscriptionToBillingContext(orgId)` which re-pulls the subscription from Stripe and reprojects state.
  - Returns the same payload as `/status`.
  - Used by the UI's "Refresh billing" button and by manual recovery flows.
- `POST /api/billing/downgrade-to-free` (owner/admin only):
  - Available only when `access_state IN ('locked', 'paused', 'canceled')`.
  - Verifies current usage fits Free; returns 400 with the over-Free detail if not.
  - Cancels any open Stripe subscription via the plugin's cancel endpoint.
  - Sets `access_state = 'free'`.
- `POST /api/billing/start-grandfather-trial-end` (internal, called by the 30-day grandfather cron, not user-facing).

All `/api/billing/*` routes are mounted only in `cloud_billing` mode. In other modes the prefix returns 404.

## Environment Variables

All new variables are added to the `tooling/env/src/index.ts` Zod schema so missing or invalid values fail at boot, not at first checkout.

### Required When `DURABULL_CLOUD && DURABULL_BILLING_ENABLED`

- `STRIPE_SECRET_KEY`.
- `STRIPE_WEBHOOK_SECRET` (primary signing secret; rotation supported via `_NEXT`).
- `STRIPE_PRICE_STARTER_MONTHLY`.
- `STRIPE_PRICE_STARTER_YEARLY`.
- `STRIPE_PRICE_TEAM_MONTHLY`.
- `STRIPE_PRICE_TEAM_YEARLY`.
- `STRIPE_PRICE_BUSINESS_MONTHLY`.
- `STRIPE_PRICE_BUSINESS_YEARLY`.
- `DURABULL_CONNECTION_FINGERPRINT_SECRET` (≥32 bytes of entropy).

### Optional

- `STRIPE_WEBHOOK_SECRET_NEXT` — secondary signing secret used during webhook secret rotation (Layer 5). When set, both primary and next secrets are tried for signature verification.
- `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` — only needed if the default Customer Portal configuration doesn't match Durabull requirements (specific cancellation copy, plan-change set, tax ID collection).
- `DURABULL_STRIPE_WEBHOOK_IP_ALLOWLIST_MODE` — `enforce` (default in production) | `monitor` | `disabled`. Use `disabled` for local Stripe CLI testing only.
- `DURABULL_STRIPE_WEBHOOK_IP_ALLOWLIST_REFRESH_URL` — override for the Stripe webhook IPs JSON. Defaults to `https://stripe.com/files/ips/ips_webhooks.json`. Only set for offline staging or private mirrors.
- `DURABULL_STRIPE_WEBHOOK_LIVEMODE_EXPECTED` — `true` in production, `false` in test/staging. The webhook handler rejects events whose `event.livemode` does not match. Defaults to `true` when `NODE_ENV === 'production'`.
- `DURABULL_BILLING_FORCE_UNLOCK` — boolean kill switch (see Runtime Billing Policy).
- `DURABULL_BILLING_SUPPORT_TOKEN` — gates the claim-release support script.
- `DURABULL_CONNECTION_FINGERPRINT_SECRET_NEXT` — only set during fingerprint key rotation.
- `DURABULL_CONNECTION_FINGERPRINT_BACKFILL_PERMISSIVE` — lets the launch migration tolerate canonicalization failures.
- `DURABULL_OPERATOR_NAME` — recorded in audit metadata when support tools run.

### Secrets Handling

All `STRIPE_*` and `DURABULL_*_SECRET` env values are loaded from the platform's secret manager in production (Cloudflare Secrets / AWS Secrets Manager / equivalent), not from a committed `.env`. The repo's `.env.example` documents the variables but never holds real values. A pre-commit hook checks staged files for accidental secret patterns and aborts.

### New Top-Level Toggle

- `DURABULL_BILLING_ENABLED` (boolean) — gates the entire billing system independently of `DURABULL_CLOUD` so cloud deploys can ship the code dark and flip it on later.

### Existing

- `DURABULL_CLOUD` — cloud-hosted mode marker.
- `DURABULL_AUTHLESS` — local/non-enforced billing. Mutually exclusive with cloud billing at boot.
- `DURABULL_REDIS_URL_ENCRYPTION_KEY` — required for the fingerprint backfill migration; abort with actionable error if missing.
- `DURABULL_DEMO_ACCOUNT_REDIS_CONNECTION_STRING` — its canonicalization is checked at runtime to bypass the fingerprint claim system.

### Mode Mutual-Exclusion Assertion

The env module asserts at boot:

```
if (DURABULL_CLOUD && DURABULL_BILLING_ENABLED && DURABULL_AUTHLESS) {
  throw new Error('Authless mode cannot be enabled together with cloud billing.')
}
```

## Rollout Plan

0. **Verification spike** (must complete before any production change):
   - Add `@better-auth/stripe` against the installed `better-auth@^1.4.9` in a feature branch.
   - Wire a Test-mode Stripe account end-to-end.
   - Confirm that a `subscription.upgrade` with `getCheckoutSessionParams` setting `payment_method_collection: 'if_required'` and the plugin's 14-day trial actually produces a Stripe Checkout Session that does not require a card.
   - Confirm Stripe emits `customer.subscription.paused` when the trial expires without a payment method.
   - Confirm `trial_end` is preserved across `subscription.upgrade` with `subscriptionId` (plan switching).
   - If any of these fail, switch to a custom Checkout-start endpoint and document the divergence in this plan before continuing.
1. Start from latest `main`. Find or create a Linear issue and reference it in branch/PR traceability.
2. Create the new `@durabull/billing` workspace package (plan config, billing context types, error envelope, Redis URL canonicalizer with fixture suite).
3. Add `stripe`, `@better-auth/stripe` dependencies to `packages/auth` and `apps/api`. Pin Stripe SDK to `^22.0.0` and API version to `2026-03-25.dahlia`.
4. Extend `tooling/env/src/index.ts` with all new variables and the mutual-exclusion assertion.
5. Conditionally register the Stripe plugin in `createAuth()` based on `DURABULL_CLOUD && DURABULL_BILLING_ENABLED && !DURABULL_AUTHLESS`. Register the Stripe client plugin in `authClient` under the same condition (set via Vite/SSR config).
6. Run `npx auth generate` and check resulting Drizzle migrations into `packages/dal/src/db/migrations/`.
7. Add `organization_billing_state` schema and migration.
8. Add `url_fingerprint` column to `redis_connection` (nullable initially) and the `redis_connection_claim` table.
9. Implement the runtime billing service: `getBillingContext`, `assertBillingAccess`, `assertPlanLimit`, `shouldProcessBackgroundBillingWork`, `resolveStripeSubscriptionToBillingContext`.
10. Implement `Better Auth Stripe` lifecycle hooks (`onSubscriptionComplete/Created/Update/Cancel/Deleted`, `freeTrial.onTrialStart/End/Expired`) and `onEvent` for invoice/paused/resumed/trial_will_end events. Every handler idempotent on `event.id`.
11. Implement `/api/billing/status`, `/api/billing/sync`, `/api/billing/downgrade-to-free`.
12. Implement billing middlewares (`attachBillingContext`, `requireBillingAccess`, `requirePlanLimit`) and mount per the exact prefixes in API Enforcement. Add the Stripe webhook exemption to `authRateLimiter`.
13. Wire plan-limit checks at the documented enforcement points (connections, environments, queues, alert rules, bandwidth).
14. Wire the Redis URL canonicalizer and fingerprint claim repository into `redisConnectionRepository.create`/`update`. Include all bypass conditions.
15. Implement the launch backfill migration with first-seen-wins policy. Verify the structured output redacts URLs and fingerprints.
16. Implement the alert monitor's `findAllEnabledForActiveOrgs` and switch the poll loop to it in cloud billing mode.
17. Implement the billing reconciliation cron and bandwidth flusher.
18. Build the web UI: billing routes, `BillingLockedScreen`, banners, `PlanPicker`, 402 normalizer.
19. Implement the existing-organization grandfather migration and 30-day cron.
20. Implement the claim-release support script under `tooling/scripts/`.
21. Write tests per the Verification Plan.
22. Configure Stripe Dashboard (Products, Prices, Customer Portal, recovery emails, Smart Retries).
23. End-to-end verification with Stripe CLI in a staging cloud environment.
24. Complete Stripe go-live checklist and flip `DURABULL_BILLING_ENABLED=true` in production behind the grandfather migration.

## Verification Plan

### DAL / Unit Tests

- Plan limit derivation by Stripe price ID.
- Free tier state for orgs with no subscription row.
- Access-state resolver matrix: every Stripe `status` (`trialing`, `active`, `past_due`, `paused`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`) crossed with (usage fits Free, usage exceeds Free) and the kill-switch on/off.
- 7-day grace calculations including `past_due_started_at` clock skew.
- Environment-count limits.
- Bandwidth accounting and warning thresholds (75/90/100%).
- Bandwidth period rollover at UTC month boundary.
- Redis URL canonicalization fixture suite covering: TLS variants, default port, db `0` equivalences, ACL `default` user, password percent-encoding, sentinel/cluster rejection, IPv6 brackets, sort of remaining query params.
- HMAC fingerprint consistency across canonicalization variants.
- Duplicate claim conflict across organizations.
- Within-org same-URL reuse is allowed (does not raise duplicate claim error).
- Deleted connection does not release claim automatically.
- Bypass conditions (`shouldUseEnvConnections`, demo connection string, kill switch) skip the claim check.
- Grandfathered trial usage snapshot is honored even when current usage exceeds plan tiers.
- `onEvent` handlers are idempotent: replaying the same Stripe `event.id` produces a single state transition and a single email.

### API Tests

- Boot fails when `DURABULL_CLOUD && DURABULL_BILLING_ENABLED && DURABULL_AUTHLESS` are all true.
- Stripe plugin is registered only when cloud billing is enabled.
- `/api/auth/stripe/webhook` returns 404 in non-cloud modes.
- `/api/auth/stripe/webhook` is exempt from `authRateLimiter` and from any auth-mode 403.
- A signed Stripe webhook payload passes through `bodyLimit` + `cors` and verifies successfully.
- Local/self-hosted runtime returns `billing.enforced = false` on `/api/app/config`.
- Local/self-hosted runtime never calls Stripe for billing status, Checkout, portal, or plan enforcement.
- Local/self-hosted runtime does not return `402` for over-Free usage.
- `subscription.upgrade` provisions org-scoped trial access.
- `invoice.payment_failed` starts grace (`past_due_started_at`, `grace_ends_at`).
- `invoice.paid` restores `active` access and clears grace fields.
- Trial-expired (`paused`) falls back to Free when usage fits.
- Trial-expired (`paused`) locks when usage exceeds Free.
- Free org can use one environment only.
- Connection, environment, queue, and alert limits enforce only in cloud billing mode.
- 402 responses match the documented envelope shape exactly (TypeScript schema assertion).
- Locked orgs can still access `/api/billing/*`, `/api/session`, `/api/app/config`, `/api/team/members`, and all `/api/auth/*` routes.
- Locked orgs receive 402 for `/api/connections/*`, `/api/c/:connectionId/*`, `/api/alerts/*`, and team write endpoints.
- `/api/billing/sync` requires owner/admin role and is rate-limited per org.
- `/api/billing/downgrade-to-free` refuses when usage exceeds Free and returns the over-Free detail.

### Alert Monitor Tests

- Locked org's rules are excluded from `findAllEnabledForActiveOrgs`.
- The monitor never opens a Redis connection for a locked org's connection.
- Non-cloud modes never apply the lock filter.

### Web Tests

- Local/self-hosted UI hides paid upgrade pressure and does not block over-plan usage.
- Signup/create org enters Free and reaches app.
- Billing page can start a card-free paid trial; Stripe Checkout URL contains no required-card hint.
- Billing page opens Stripe Customer Portal through Better Auth Stripe.
- Trial, grandfather-trial, past-due, paused, and locked banners render correctly.
- Free-tier usage copy renders correctly.
- Locked account renders `BillingLockedScreen` with org switcher still functional.
- Switching to a non-locked org from a locked org's `BillingLockedScreen` works.
- Limit-hit errors render `PlanLimitNotice` inline (no generic toast).
- Duplicate Redis URL error is clear and non-leaky.
- 402 normalizer never emits a generic toast for any 402 envelope.

### Stripe Integration Tests (Stripe CLI)

- Trigger subscription and invoice events; verify state reprojection.
- Test card-free trial Checkout.
- Test trial ending without payment method emits `customer.subscription.paused`.
- Test failed renewal grace lifecycle.
- Test payment method update restores access via `customer.subscription.resumed`.
- Test plan switching mid-trial preserves `trial_end`.
- Test duplicate webhook deliveries are idempotent.

### Webhook Security Tests (`apps/api/src/routes/stripe-webhook.security.test.ts`)

Each test posts to `/api/auth/stripe/webhook` and asserts the response and side effects.

**Layer 1 / 2 — Transport and IP allowlist:**

- IP-allowlist `enforce`: a request from an IP not in the loaded allowlist returns `403` with empty body, no log line containing the body or headers, and increments `stripe_webhook_ip_allowlist_rejections_total`.
- IP-allowlist `monitor`: same request reaches the signature step but emits a metric.
- IP-allowlist `disabled`: signature step is reached without IP check.
- Allowlist refresh: network failure during refresh falls back to the bundled snapshot; never empties the cache to an open state.

**Layer 3 — Request shape:**

- `GET /api/auth/stripe/webhook` → `405`, no body.
- `PUT`, `DELETE`, `PATCH` → `405`.
- `POST` with `Content-Type: text/plain` → `400`.
- `POST` without `Stripe-Signature` header → `400`.
- `POST` with `Content-Length: 65537` (1 byte over 64 KB) → `413` and the body is never read.
- `POST` with valid headers and an empty body → `400` at signature step (does not crash).

**Layer 4 — Signature verification:**

- Valid signature, real Stripe event payload → `200`, state reprojected, audit log line written with `event.id`/`event.type`/IP, and no log line contains the body or signature header.
- Signature computed with a wrong secret → `400` with body `Webhook signature verification failed`, metric `stripe_webhook_signature_failures_total` incremented, structured log line contains the IP and nothing else from the payload.
- Signature computed over a tampered body → `400` (Stripe SDK detects mismatch).
- Signature with a timestamp older than 300 seconds → `400` (replay outside tolerance).
- Five signature failures from the same IP within 60 seconds fires the security alert.

**Layer 5 — Dual-secret rotation:**

- Only `STRIPE_WEBHOOK_SECRET` set: signed with primary → `200`; signed with anything else → `400`.
- Both `STRIPE_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET_NEXT` set: signed with either → `200`; signed with neither → `400`.
- Boot warning emitted when `_NEXT` has been set for >14 days (mock-clock test).

**Layer 6 — Replay and idempotency:**

- Posting the same verified event twice produces a single state mutation and a single email send; `last_processed_stripe_event_id` matches the second call without a second write.
- Posting an event with `event.livemode = false` to a production-mode instance → `400`, metric `stripe_webhook_livemode_mismatch_total` incremented.
- Posting an event with `event.livemode = true` to a test-mode instance → `400`.

**Layer 7 — Rate limiter:**

- 201 requests from the same allowlisted IP in 10s: the 201st returns `429` with `Retry-After`, but the first 200 succeed.
- The webhook rate limiter does not count requests that failed Layer 1–3 (those are dropped before reaching the limiter).
- A `429` from this limiter does not increment `stripe_webhook_signature_failures_total`.

**Cross-cutting:**

- No log line emitted by the entire stack during any test contains the substrings of: the body, the `Stripe-Signature` header value, `STRIPE_WEBHOOK_SECRET`, or any URL-form Redis fingerprint.
- The webhook handler does not read or set any cookie.
- The webhook path is reachable in cloud-billing mode and 404s in all other modes.
- The verification spike's "end-to-end raw body" test posts a real signed payload through CORS → bodyLimit → secureHeaders → webhook middlewares → auth handler and verifies signature success; this test runs on every PR to detect middleware regressions.

### Migration Tests

- Backfill encrypted Redis URLs without logging secrets (log capture asserts no URL or fingerprint substring appears).
- First-seen-wins policy applied deterministically across duplicate fingerprints.
- Migration aborts with actionable error when `DURABULL_REDIS_URL_ENCRYPTION_KEY` or `DURABULL_CONNECTION_FINGERPRINT_SECRET` is missing.
- `DURABULL_CONNECTION_FINGERPRINT_BACKFILL_PERMISSIVE=true` allows canonicalization-failed rows to be skipped.
- Sentinel/cluster URLs are recorded in the structured error output and not assigned a fingerprint.
- Migration compatibility with both Postgres and PGlite runtimes.
- Grandfather migration inserts a `trialing` row for every existing org with `grace_ends_at = deploy_time + 30 days`.
- 30-day grandfather cron correctly transitions to Free or Locked based on usage at expiry.

### Support Tool Tests

- `release-redis-connection-claim.ts` refuses to run without `DURABULL_BILLING_SUPPORT_TOKEN`.
- `--transfer` writes audit entries to both source and target `organization_billing_state.metadata`.
- `--release` allows a subsequent connection create in any org to claim the fingerprint.

## Open Risks

- Better Auth Stripe plugin behavior must be verified against installed `better-auth@^1.4.9` during the verification spike (rollout step 0). If the plugin cannot expose `payment_method_collection=if_required` through `getCheckoutSessionParams`, fall back to a minimal custom Checkout-start endpoint that uses the plugin's storage and webhook handling.
- `user.stripeCustomerId` is created by the plugin migration; it is intentionally nullable and unused (`createCustomerOnSignUp: false`).
- Card-free trials reduce Stripe Radar usefulness because no payment method exists to evaluate. The Redis fingerprint claim system is the primary anti-abuse layer.
- Free fallback can be confusing when usage exceeds Free limits; the UI must list the specific resources to remove and the alternative recovery actions.
- Bandwidth measurement is noisy unless centralized; the plan mandates a single outermost middleware and a 60-second flush cadence.
- Seat enforcement is warning-only in phase 1 and must never block normal collaboration.
- Existing-organization backfill on launch day must use the grandfather migration; without it, paying customers risk being locked.
- Hono `bodyLimit` and rate limiters can interact with Stripe webhook delivery; the plan documents the required exemptions, the dedicated webhook rate limiter, and an end-to-end raw-body signature-verification test.
- The Stripe webhook is the only public, unauthenticated billing surface and is protected by seven independent layers (TLS+HSTS, Stripe IP allowlist, strict request shape, signature verification, dual-secret rotation, replay/livemode/idempotency, dedicated rate limiter). See "Stripe Webhook Security (Defense in Depth)".
- Stripe webhook IP list changes over time; the cached allowlist refreshes every 6 hours with a bundled snapshot fallback. A snapshot that gets stale enough may reject legitimate Stripe traffic — the snapshot must be refreshed in the repo at least quarterly, tracked as an ops task.
- `STRIPE_WEBHOOK_SECRET` rotation requires a 24-hour overlap window using `STRIPE_WEBHOOK_SECRET_NEXT`. A boot warning surfaces stale `_NEXT` values past 14 days.
- Test-mode events must never reach a live system. `DURABULL_STRIPE_WEBHOOK_LIVEMODE_EXPECTED` enforces this; a misconfiguration here is the most plausible "fake free trial" attack vector and must be alerted on at boot.
- PGlite supports the new schema in Drizzle but must be re-verified after `npx auth generate` produces migration SQL.
- Stripe API version drift: pinning is explicit; future upgrades require an additional migration test pass.
- Fingerprint secret rotation requires a two-key migration; phase 1 does not ship the rotation tooling.
- Multi-org users must retain access to non-locked orgs. The org switcher remains functional in the locked screen.
- Better Auth Stripe blocks deletion of orgs with active subscriptions; the team UI must surface this constraint with copy.

## Architecture Overview

```mermaid
flowchart TD
  bootCheck[Boot: cloud + billing + !authless] --> registerPlugin[Register Stripe Plugin]
  userSignup[User Signup] --> orgSetup[Create Organization]
  orgSetup --> freeTier[Free Tier Access]
  freeTier --> planPicker[Plan Picker]
  planPicker --> baUpgrade[Better Auth subscription.upgrade]
  baUpgrade --> checkout[Stripe Checkout - payment_method_collection=if_required]
  checkout --> tls[Layer 1 - TLS + HSTS]
  tls --> ipAllow[Layer 2 - Stripe IP allowlist]
  ipAllow --> shape[Layer 3 - POST + Content-Type + 64KB]
  shape --> rateLimit[Layer 7 - dedicated webhook rate limiter]
  rateLimit --> sig[Layer 4 - Signature verify with constructEventAsync]
  sig --> dual[Layer 5 - Dual secret rotation]
  dual --> livemode[Layer 6 - livemode + event.id idempotency]
  livemode --> baWebhook[Better Auth handler routes to plugin]
  baWebhook --> subscriptionTable[Better Auth subscription table]
  subscriptionTable --> hooks[onSubscription / onTrial / onEvent - idempotent]
  hooks --> billingState[organization_billing_state]
  billingState --> resolver[Access State Resolver]
  resolver --> apiGate[attachBillingContext + requireBillingAccess]
  apiGate --> appAccess[Durabull App Access]
  billingState --> alertMonitor[findAllEnabledForActiveOrgs]
  billingState --> reconCron[Reconciliation Cron]
  billingState --> bandwidth[Bandwidth Flusher]
  appAccess --> connectionCreate[POST /api/connections]
  connectionCreate --> canonical[Canonical Redis URL]
  canonical --> bypass{Bypass: env-connections / demo / kill-switch?}
  bypass -- yes --> allowBypass[Allow without claim]
  bypass -- no --> fingerprint[HMAC Fingerprint]
  fingerprint --> claimCheck[Claim Check transactional]
  claimCheck -- new --> insertClaim[Insert claim + connection]
  claimCheck -- same org --> updateClaim[Update connection]
  claimCheck -- other org --> blockDuplicate[409 Conflict]
  grandfather[Launch: Grandfather Migration] --> billingState
  killSwitch[DURABULL_BILLING_FORCE_UNLOCK] -.short-circuit.-> resolver
```

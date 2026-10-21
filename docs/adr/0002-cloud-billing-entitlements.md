# ADR-0002: Cloud billing and server-side entitlements

Status: Accepted · 2026-10-20

## Context

Durabull Cloud introduces Free, Team ($9), Business ($29) and Enterprise plans per organization.
Durabull remains Apache-2.0; desktop and self-hosted installs must keep
every local feature without contacting Stripe. Paywalls must hold on every boundary: HTTP routes, the
Hono RPC client, Better Auth organization endpoints, MCP tools and resources, background alert
evaluation, queued deliveries and history queries.

## Decision

1. **Stripe-hosted money flows.** Checkout and the Customer Portal handle payment, invoices, plan
   changes and cancellation. Durabull only creates organization-bound sessions (owner only).
2. **Versioned local catalog** (`packages/billing`) is the single source of plans, features and limits.
   Stripe Entitlements is not used, to avoid two catalogs that can disagree.
3. **Pure resolver.** `resolveEntitlement` maps verified evidence (subscription projection, last paid
   plan, overrides, migration grant, contract limits, verification time) to effective access. The
   lifecycle table is unit-tested.
4. **Materialized entitlement + reconciliation.** Signed webhooks are stored in a durable Postgres
   inbox and only trigger reconciliation against Stripe's current state, serialized per organization,
   so duplicate, delayed and out-of-order events converge. A 6-hour sweep and targeted refreshes
   cover missed events. Stripe is never called on the request path.
5. **Database-enforced capacity.** Triggers on `redis_connection`, `member`, `invitation`,
   `alert_rule`, `alert_destination` and `mcp_service_account` check the materialized limits under a
   per-organization advisory lock. Application pre-checks return friendly `409 plan_limit_reached`
   responses; the trigger is the race-free backstop for every write path.
6. **Capability keys, not plan names.** Code calls `requireFeature(org, 'mcp.write')` /
   `assertCapacity(org, 'connections.enabled')`. Denials use one shape: `403 feature_not_entitled`,
   `409 plan_limit_reached`, `503 billing_state_unverified`; MCP maps them to its JSON-RPC `-32003`
   error with the same `data.code`.
7. **Billing narrows, never widens.** Plan checks run after authentication, membership, role and MCP
   scope policy. A plan never expands a token's consented scopes; ADR-0001's opt-in writes,
   redaction and tenant isolation are unchanged. The MCP billing organization is derived from the
   authorized connection (delegated users) or the bound organization (service accounts).
8. **Reversible suspension.** Over-limit resources are suspended through
   `billing_resource_suspension`, never deleted, and billing never mutates customer Redis data.
9. **Deployment policy.** Billing is enabled only on the managed Cloud deployment; startup refuses
   unsafe combinations (authless, env connections, missing keys). Enforcement rolls out through
   `off → shadow → pilot → on`.

## Consequences

- Billing adds a Postgres dependency for production Cloud and a small background lifecycle worker.
- Capacity trigger errors surface as `SQLSTATE DBL01`; route handlers that catch database errors
  must rethrow billing errors (`toBillingHttpError`).
- Time-based transitions (trials, grace, adjustment windows, grants) are materialized by deadline;
  request-time reads re-materialize when a deadline has passed.
- Self-service MCP service accounts now exist (Settings → Service accounts), backed by bearer tokens
  stored like other Better Auth access tokens and shown once.

/**
 * Operator CLI for Durabull Cloud billing. Run against the Cloud database with
 * the same environment as the API (DATABASE_URL, STRIPE_* and
 * DURABULL_BILLING_* variables).
 *
 * Usage:
 *   bun tooling/scripts/billing-ops.ts status
 *   bun tooling/scripts/billing-ops.ts events [--failed|--dead|--all] [--limit 50]
 *   bun tooling/scripts/billing-ops.ts retry <stripe-event-id>
 *   bun tooling/scripts/billing-ops.ts reconcile <organization-id>|--all
 *   bun tooling/scripts/billing-ops.ts lookup <organization-id>|<cus_...>
 *   bun tooling/scripts/billing-ops.ts override grant <organization-id> <plan> --reason "…" --by <operator> --expires <ISO> [--limits '{"connections.enabled":8}']
 *   bun tooling/scripts/billing-ops.ts override revoke <override-id> --reason "…" --by <operator>
 *   bun tooling/scripts/billing-ops.ts contract <organization-id> --limits '{"connections.enabled":60}' --reason "…" --by <operator>
 *   bun tooling/scripts/billing-ops.ts migration-grant <organization-id> <ISO|none> --reason "…" --by <operator>
 *   bun tooling/scripts/billing-ops.ts stripe-setup [--webhook-url https://…/api/billing/webhook] [--live]
 *
 * Every manual entitlement change needs an operator and a reason (overrides
 * also an expiry). Each one is written to billing_operator_action, which is
 * kept after revocation and after the organization is deleted.
 */

import { isLimitKey, isPlanCode } from '../../packages/billing/src/catalog'
import { billingRepository, closeDb, type BillingWebhookEvent } from '@durabull/dal'
import { env } from '@durabull/env'
import { invalidateEntitlementCache, materializeEntitlement } from '../../apps/api/src/billing/entitlements'
import { reconcileAllOrganizations, reconcileOrganization } from '../../apps/api/src/billing/reconcile'
import { setupStripeCatalog } from '../../apps/api/src/billing/stripe-setup'

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function requireArg(value: string | undefined, message: string): string {
  if (!value) {
    console.error(message)
    process.exit(1)
  }
  return value
}

function parseLimits(raw: string | undefined): Record<string, number | null> | null {
  if (!raw) return null
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const limits: Record<string, number | null> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!isLimitKey(key)) throw new Error(`Unknown limit key: ${key}`)
    if (value !== null && (typeof value !== 'number' || value < 0)) {
      throw new Error(`Limit ${key} must be a non-negative number or null`)
    }
    limits[key] = value as number | null
  }
  return limits
}

function printEvents(events: BillingWebhookEvent[]) {
  console.table(
    events.map((event) => ({
      id: event.id,
      type: event.type,
      status: event.status,
      attempts: event.attempts,
      organization: event.organizationId,
      received: event.receivedAt.toISOString(),
      error: event.lastError?.slice(0, 80) ?? '',
    }))
  )
}

async function lookup(target: string) {
  const account = target.startsWith('cus_')
    ? await billingRepository.findAccountByCustomerId(target)
    : await billingRepository.findAccount(target)
  const organizationId = account?.organizationId ?? target
  const [organization, subscriptions, entitlement, suspensions, overrides, usage] = await Promise.all([
    billingRepository.findOrganization(organizationId),
    billingRepository.listSubscriptions(organizationId),
    billingRepository.findEntitlement(organizationId),
    billingRepository.listSuspensions(organizationId),
    billingRepository.listOverrides(organizationId),
    billingRepository.getUsage(organizationId),
  ])
  console.log(JSON.stringify({ organization, account, entitlement, usage, subscriptions, suspensions, overrides }, null, 2))
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  switch (command) {
    case 'status': {
      const stats = await billingRepository.webhookInboxStats(new Date())
      const entitlements = await billingRepository.listEntitlements()
      const byPlan: Record<string, number> = {}
      for (const row of entitlements) {
        const key = `${row.planCode}/${row.source}${row.degraded ? '/degraded' : ''}`
        byPlan[key] = (byPlan[key] ?? 0) + 1
      }
      console.log('Webhook inbox:', stats)
      console.log('Entitlements by plan/source:')
      console.table(byPlan)
      break
    }
    case 'events': {
      const statuses: BillingWebhookEvent['status'][] | undefined = args.includes('--dead')
        ? ['dead']
        : args.includes('--failed')
          ? ['failed', 'dead']
          : args.includes('--all')
            ? undefined
            : ['pending', 'processing', 'failed', 'dead']
      printEvents(await billingRepository.listWebhookEvents({ statuses, limit: Number(flag(args, '--limit') ?? 50) }))
      break
    }
    case 'retry': {
      const id = requireArg(args[0], 'Usage: retry <stripe-event-id>')
      console.log((await billingRepository.retryWebhookEvent(id)) ? `Requeued ${id}` : `${id} is not failed or dead`)
      break
    }
    case 'reconcile': {
      if (args[0] === '--all') {
        console.log(await reconcileAllOrganizations({ reason: 'operator' }))
      } else {
        const organizationId = requireArg(args[0], 'Usage: reconcile <organization-id>|--all')
        console.log(await reconcileOrganization(organizationId, { reason: 'operator' }))
      }
      break
    }
    case 'lookup':
      await lookup(requireArg(args[0], 'Usage: lookup <organization-id>|<cus_...>'))
      break
    case 'override': {
      const [action, ...rest] = args
      if (action === 'grant') {
        const [organizationId, plan] = rest
        if (!organizationId || !isPlanCode(plan)) {
          console.error('Usage: override grant <organization-id> <free|team|business|enterprise> --reason … --by … --expires <ISO>')
          process.exit(1)
        }
        const reason = requireArg(flag(rest, '--reason'), '--reason is required')
        const by = requireArg(flag(rest, '--by'), '--by is required')
        const expiresAt = new Date(requireArg(flag(rest, '--expires'), '--expires is required'))
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
          console.error('--expires must be a future ISO date')
          process.exit(1)
        }
        const limits = parseLimits(flag(rest, '--limits'))
        const row = await billingRepository.createOverride({
          organizationId,
          planCode: plan,
          limits,
          reason,
          createdBy: by,
          expiresAt,
        })
        await billingRepository.recordOperatorAction({
          organizationId,
          action: 'override_granted',
          actor: by,
          reason,
          details: { overrideId: row.id, plan, limits, expiresAt: expiresAt.toISOString() },
        })
        await materializeEntitlement(organizationId, { reason: 'operator_override' })
        console.log('Override created:', row.id)
      } else if (action === 'revoke') {
        const id = requireArg(rest[0], 'Usage: override revoke <override-id> --by <operator>')
        const by = requireArg(flag(rest, '--by'), '--by is required')
        const reason = requireArg(flag(rest, '--reason'), '--reason is required')
        const row = await billingRepository.revokeOverride(id, by)
        if (!row) {
          console.error('Override not found or already revoked')
          process.exit(1)
        }
        await billingRepository.recordOperatorAction({
          organizationId: row.organizationId,
          action: 'override_revoked',
          actor: by,
          reason,
          details: { overrideId: id },
        })
        await materializeEntitlement(row.organizationId, { reason: 'operator_override_revoked' })
        console.log('Override revoked:', id)
      } else {
        console.error('Usage: override grant|revoke …')
        process.exit(1)
      }
      break
    }
    case 'contract': {
      const usage = 'Usage: contract <organization-id> --limits <json> --reason … --by <operator>'
      const organizationId = requireArg(args[0], usage)
      const reason = requireArg(flag(args, '--reason'), '--reason is required')
      const by = requireArg(flag(args, '--by'), '--by is required')
      const limits = parseLimits(flag(args, '--limits'))
      await billingRepository.setContractLimits(organizationId, limits)
      await billingRepository.recordOperatorAction({
        organizationId,
        action: 'contract_limits_set',
        actor: by,
        reason,
        details: { limits },
      })
      await materializeEntitlement(organizationId, { reason: 'contract_limits' })
      console.log('Contract limits updated for', organizationId)
      break
    }
    case 'migration-grant': {
      const usage = 'Usage: migration-grant <organization-id> <ISO|none> --reason … --by <operator>'
      const organizationId = requireArg(args[0], usage)
      const raw = requireArg(args[1], usage)
      const reason = requireArg(flag(args, '--reason'), '--reason is required')
      const by = requireArg(flag(args, '--by'), '--by is required')
      // "none" stores a past instant: null means "never decided" and would be re-applied.
      const expiresAt = raw === 'none' ? new Date() : new Date(raw)
      if (Number.isNaN(expiresAt.getTime())) {
        console.error('The grant end must be an ISO date or "none"')
        process.exit(1)
      }
      await billingRepository.setMigrationGrant(organizationId, expiresAt)
      await billingRepository.recordOperatorAction({
        organizationId,
        action: raw === 'none' ? 'migration_grant_cleared' : 'migration_grant_set',
        actor: by,
        reason,
        details: { expiresAt: expiresAt.toISOString() },
      })
      await materializeEntitlement(organizationId, { reason: 'migration_grant' })
      console.log('Migration grant updated for', organizationId)
      break
    }
    case 'stripe-setup': {
      const secretKey = requireArg(
        env.STRIPE_API_KEY ?? env.STRIPE_SECRET_KEY,
        'STRIPE_API_KEY is required'
      )
      const mode = args.includes('--live') ? 'live' : 'sandbox'
      const result = await setupStripeCatalog({
        secretKey,
        mode,
        webhookUrl: flag(args, '--webhook-url'),
      })
      console.log(`# Stripe ${mode} mode. Add to the API environment:`)
      for (const [key, value] of Object.entries(result.env)) console.log(`${key}=${value}`)
      if (result.webhookSecret) console.log(`STRIPE_WEBHOOK_SECRET=${result.webhookSecret}`)
      break
    }
    default:
      console.error('Unknown command. See the usage block at the top of tooling/scripts/billing-ops.ts.')
      process.exit(1)
  }
  invalidateEntitlementCache()
}

try {
  await main()
} finally {
  await closeDb()
}

import type { OrganizationPolicyHooks } from '@durabull/auth'
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@durabull/billing'
import { billingRepository, eq, getDb, isOwnerRole, member } from '@durabull/dal'
import { APIError } from 'better-auth/api'
import { getBillingConfig, isBillingEnabled, isEnforcedFor } from './config'
import { assertCapacity, rebalanceCapacity } from './entitlements'
import { BillingStateUnverifiedError, PlanLimitReachedError } from './errors'

/** Abuse control: a person can own at most this many organizations on Cloud. */
export const MAX_OWNED_ORGANIZATIONS_PER_USER = 10

function toApiError(error: unknown): never {
  if (error instanceof PlanLimitReachedError) {
    // Same 409 contract as the HTTP routes (ADR-0002).
    throw new APIError('CONFLICT', { ...error.toBody() })
  }
  if (error instanceof BillingStateUnverifiedError) {
    throw new APIError('SERVICE_UNAVAILABLE', { ...error.toBody() })
  }
  throw error
}

/**
 * Better Auth organization-plugin hooks for Cloud billing. Invitations and
 * acceptances travel through the auth plugin, not the custom team routes, so
 * seat reservations are enforced here (with the database trigger as the
 * race-free backstop). A frontend limit around the Invite button alone would
 * not close the direct auth API path.
 */
export function createBillingOrganizationPolicy(): OrganizationPolicyHooks | undefined {
  if (!isBillingEnabled()) return undefined
  return {
    async beforeCreateInvitation({ organizationId }) {
      try {
        await assertCapacity(organizationId, 'members.reserved', 1)
      } catch (error) {
        toApiError(error)
      }
    },

    async beforeAcceptInvitation({ organizationId, invitationId }) {
      if (
        isEnforcedFor(organizationId) &&
        (await billingRepository.isSuspended('invitation', invitationId))
      ) {
        throw new APIError('FORBIDDEN', {
          message:
            'This invitation is paused because the organization is above its plan’s member limit. Ask the owner to restore it or upgrade.',
          code: 'invitation_suspended',
        })
      }
      try {
        // Acceptance converts an existing reservation into a membership, so it
        // needs no additional capacity, only that the reservation still fits.
        await assertCapacity(organizationId, 'members.reserved', 0)
      } catch (error) {
        // The person accepting is not a member yet and cannot change the plan,
        // so they get who to ask rather than an upgrade prompt.
        if (error instanceof PlanLimitReachedError) {
          throw new APIError('CONFLICT', {
            message:
              'This organization has more people than its plan includes, so the invitation cannot be accepted yet. It stays valid: ask the organization owner to free a seat or upgrade, then try again.',
            code: 'invitation_seat_unavailable',
          })
        }
        toApiError(error)
      }
    },

    async beforeDeleteOrganization({ organizationId, userId }) {
      // Deleting an organization with a live subscription would orphan it.
      // This protects billing integrity, so it applies in every rollout mode.
      const current = await billingRepository.findCurrentSubscription(organizationId)
      if (current && LIVE_SUBSCRIPTION_STATUSES.has(current.status as SubscriptionStatus)) {
        throw new APIError('BAD_REQUEST', {
          message:
            'Cancel this organization’s subscription in Settings → Billing and wait for it to end before deleting the organization.',
          code: 'billing_subscription_active',
        })
      }
      // Billing rows are removed with the organization; keep the Stripe
      // identifiers so later refunds or disputes can still be matched.
      const [account, subscriptions] = await Promise.all([
        billingRepository.findAccount(organizationId),
        billingRepository.listSubscriptions(organizationId),
      ])
      if (account || subscriptions.length > 0) {
        await billingRepository.recordOperatorAction({
          organizationId,
          action: 'organization_deleted',
          actor: userId,
          reason: 'Organization deleted by an owner',
          details: {
            stripeCustomerId: account?.stripeCustomerId ?? null,
            subscriptions: subscriptions.map((sub) => ({
              id: sub.stripeSubscriptionId,
              status: sub.status,
              planCode: sub.planCode,
            })),
          },
        })
      }
    },

    async afterSeatFreed({ organizationId }) {
      // The seat is already free; a paused member or invitation takes it.
      await rebalanceCapacity(organizationId)
    },

    async hasReachedOrganizationLimit(user) {
      // An abuse control, so it observes the same rollout as plan limits.
      if (getBillingConfig().enforcement !== 'on') return false
      const db = await getDb()
      const rows = await db
        .select({ role: member.role })
        .from(member)
        .where(eq(member.userId, user.id))
      return rows.filter((row) => isOwnerRole(row.role)).length >= MAX_OWNED_ORGANIZATIONS_PER_USER
    },
  }
}

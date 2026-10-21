import type { OrganizationPolicyHooks } from '@durabull/auth'
import { and, billingRepository, eq, getDb, member, sql } from '@durabull/dal'
import { APIError } from 'better-auth/api'
import { isBillingEnabled, isEnforcedFor } from './config'
import { assertCapacity } from './entitlements'
import { BillingStateUnverifiedError, PlanLimitReachedError } from './errors'

/** Abuse control: a person can own at most this many organizations on Cloud. */
export const MAX_OWNED_ORGANIZATIONS_PER_USER = 10

const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

function toApiError(error: unknown): never {
  if (error instanceof PlanLimitReachedError) {
    throw new APIError('FORBIDDEN', { ...error.toBody() })
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
        toApiError(error)
      }
    },

    async beforeDeleteOrganization({ organizationId }) {
      // Deleting an organization with a live subscription would orphan it.
      const current = await billingRepository.findCurrentSubscription(organizationId)
      if (current && LIVE_SUBSCRIPTION_STATUSES.has(current.status)) {
        throw new APIError('BAD_REQUEST', {
          message:
            'Cancel this organization’s subscription in Settings → Billing and wait for it to end before deleting the organization.',
          code: 'billing_subscription_active',
        })
      }
    },

    async hasReachedOrganizationLimit(user) {
      const db = await getDb()
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(member)
        .where(and(eq(member.userId, user.id), eq(member.role, 'owner')))
      return Number(row?.count ?? 0) >= MAX_OWNED_ORGANIZATIONS_PER_USER
    },
  }
}

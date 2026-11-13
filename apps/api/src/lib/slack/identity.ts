import {
  type SlackInstallation,
  type SlackInstallationWithOrganization,
  type SlackOrganizationMember,
  slackInstallationRepository,
} from '@durabull/dal'
import { hasFeature, isMemberSuspended } from '../../billing/entitlements'
import { getSlackUser, type SlackUser } from './client'
import { withSlackToken } from './token'

const PROFILE_CACHE_TTL_MS = 10 * 60_000
const profileCache = new Map<string, { value: SlackUser; expiresAt: number }>()

export function clearSlackProfileCache(): void {
  profileCache.clear()
}

async function getSlackProfile(
  installation: SlackInstallation,
  slackUserId: string
): Promise<SlackUser> {
  const key = `${installation.slackTeamId}:${slackUserId}`
  const cached = profileCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const value = await withSlackToken(installation, (token) => getSlackUser(token, slackUserId))
  profileCache.set(key, { value, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS })
  return value
}

export type SlackActorResult =
  | { ok: true; member: SlackOrganizationMember; slackUser: SlackUser }
  | {
      ok: false
      reason:
        | 'other_workspace'
        | 'no_email'
        | 'not_a_member'
        | 'suspended'
        | 'not_entitled'
        | 'actions_disabled'
      message: string
    }

/**
 * Slack actions run as the Durabull member whose account email matches the
 * Slack user's profile email. Slack verifies workspace emails, and member
 * emails are controlled by the organization's invitations, so the match ties
 * a click to a person the organization already trusts.
 */
export async function resolveSlackActor(
  installation: SlackInstallation & { organizationName?: string },
  slackUserId: string,
  options: { requireActions?: boolean } = {}
): Promise<SlackActorResult> {
  const orgLabel = installation.organizationName
    ? `the ${installation.organizationName} organization`
    : 'this Durabull organization'
  const slackUser = await getSlackProfile(installation, slackUserId)
  // Slack Connect guests keep their own workspace, whose admins control their
  // emails; only people in the installed workspace (or its Enterprise Grid) act.
  const sameWorkspace =
    !slackUser.teamId ||
    slackUser.teamId === installation.slackTeamId ||
    (installation.slackEnterpriseId !== null &&
      slackUser.enterpriseId === installation.slackEnterpriseId)
  if (!sameWorkspace) {
    return {
      ok: false,
      reason: 'other_workspace',
      message:
        'Durabull actions are only available to members of the Slack workspace where Durabull is installed.',
    }
  }
  if (!slackUser.email) {
    return {
      ok: false,
      reason: 'no_email',
      message:
        'Durabull could not read your Slack email address, so it cannot match you to a Durabull member.',
    }
  }
  const member = await slackInstallationRepository.findMemberByEmail(
    installation.organizationId,
    slackUser.email
  )
  if (!member) {
    return {
      ok: false,
      reason: 'not_a_member',
      // Never name the organization to someone who is not in it.
      message: `Your Slack email (${slackUser.email}) does not belong to a member of the Durabull organization connected to this workspace. Ask its owner to invite that address.`,
    }
  }
  // Plan and settings are only explained once we know the person is a member.
  if (!(await hasFeature(installation.organizationId, 'integrations.slack'))) {
    return {
      ok: false,
      reason: 'not_entitled',
      message: `The Slack app is not included in ${orgLabel}'s current Durabull plan. An owner can upgrade under Settings → Billing.`,
    }
  }
  if (options.requireActions && !installation.actionsEnabled) {
    return {
      ok: false,
      reason: 'actions_disabled',
      message: `Actions from Slack are turned off for ${orgLabel}. Use Durabull to respond, or ask an admin to turn them on under Settings → Integrations.`,
    }
  }
  if (await isMemberSuspended(installation.organizationId, member.userId)) {
    return {
      ok: false,
      reason: 'suspended',
      message: `Your seat in ${orgLabel} is paused by its plan's member limit.`,
    }
  }
  return { ok: true, member, slackUser }
}

export interface SlackDenial {
  installation: SlackInstallationWithOrganization
  reason: Extract<SlackActorResult, { ok: false }>['reason'] | 'lookup_failed'
  message: string
}

/** Whether the person is a member of the denied organization, so naming it leaks nothing. */
export function isMemberDenial(denial: SlackDenial): boolean {
  return (
    denial.reason === 'suspended' ||
    denial.reason === 'not_entitled' ||
    denial.reason === 'actions_disabled'
  )
}

/**
 * The organizations a Slack user can see from a workspace: every active
 * installation whose organization has a member with the user's email.
 */
export async function resolveSlackUserOrganizations(
  slackTeamId: string,
  slackUserId: string
): Promise<{
  allowed: Array<{
    installation: SlackInstallationWithOrganization
    member: SlackOrganizationMember
  }>
  denied: SlackDenial[]
  installations: SlackInstallationWithOrganization[]
}> {
  const installations = await slackInstallationRepository.listActiveByTeam(slackTeamId)
  const allowed: Array<{
    installation: SlackInstallationWithOrganization
    member: SlackOrganizationMember
  }> = []
  const denied: SlackDenial[] = []
  for (const installation of installations) {
    try {
      const actor = await resolveSlackActor(installation, slackUserId)
      if (actor.ok) allowed.push({ installation, member: actor.member })
      else denied.push({ installation, reason: actor.reason, message: actor.message })
    } catch (error) {
      console.warn('[slack] Could not resolve Slack user', {
        organizationId: installation.organizationId,
        error: error instanceof Error ? error.message : String(error),
      })
      denied.push({
        installation,
        reason: 'lookup_failed',
        message: 'Durabull could not look up your Slack profile. Try again in a moment.',
      })
    }
  }
  return { allowed, denied, installations }
}

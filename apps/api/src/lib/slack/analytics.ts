import {
  type AnalyticsEventName,
  AnalyticsProperties,
  SlackSurface,
  type SlackSurfaceValue,
} from '@durabull/analytics/events'
import {
  captureMcpAnalyticsServerEvent,
  hashTelemetryIdentifier,
  shouldDedupeIdentifiedPosthogEvents,
  tryGetServerAnalyticsOptions,
} from '@durabull/analytics/server'
import { SlackApiError } from './client'
import { resolveSlackUserOrganizations } from './identity'

/** Slack analytics event names (`slack_*` in `AnalyticsEvents`). */
export type SlackAnalyticsEvent = Extract<AnalyticsEventName, `slack_${string}`>

type SlackPropertyKey =
  | Extract<(typeof AnalyticsProperties)[keyof typeof AnalyticsProperties], `slack_${string}`>
  | typeof AnalyticsProperties.SUCCESS

/**
 * Properties a Slack event may carry. Keys are typed so a typo fails to compile
 * instead of making the sanitizer reject (and silently drop) the whole event.
 */
export type SlackAnalyticsProperties = Partial<
  Record<SlackPropertyKey, string | number | boolean | null | undefined>
>

/** Who did a Slack thing, as far as Durabull knows. Raw ids never leave the server as properties. */
export interface SlackAnalyticsActor {
  /** The Durabull organization the activity belongs to. */
  organizationId?: string | null
  /** The Durabull member, when known (signed-in web user, or a Slack user matched by email). */
  userId?: string | null
  /** The Slack workspace and user, used only to derive a hashed key for unmatched Slack users. */
  slackTeamId?: string | null
  slackUserId?: string | null
}

/** The Slack workspace and user behind an interaction. */
export interface SlackUserRef {
  slackTeamId: string
  slackUserId: string
}

const pending = new Set<Promise<void>>()

/** Test helper: waits for every analytics capture started so far. */
export async function flushSlackAnalytics(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending])
}

export function isSlackAnalyticsEnabled(): boolean {
  return tryGetServerAnalyticsOptions()?.enabled === true
}

function hashedKey(kind: string, value: string, secret: string | null): string | null {
  return secret ? hashTelemetryIdentifier(`${kind}:${value}`, secret) : null
}

function definedProperties(properties: SlackAnalyticsProperties): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined))
}

/**
 * Records Slack app activity in PostHog.
 *
 * Only a Durabull member becomes a PostHog person: their distinct id is the
 * Durabull user id, as in the browser's `identifyUser`, so Slack usage joins
 * their web activity. Unmatched Slack users and organization-level events
 * (alert delivery, uninstall) use a hashed key with person processing off, so
 * they never inflate user counts. Every event carries the organization group,
 * as in `identifyOrganization`. Self-hosted installs also send the anonymous,
 * sanitized copy like every other server event.
 *
 * Fire-and-forget: analytics never slows down or fails a Slack request.
 */
export function recordSlackEvent(
  event: SlackAnalyticsEvent,
  actor: SlackAnalyticsActor,
  properties: SlackAnalyticsProperties = {}
): void {
  const options = tryGetServerAnalyticsOptions()
  if (!options?.enabled) return

  const capture = (async () => {
    const secret = options.hmacSecret
    const organizationId = actor.organizationId ?? null
    const userKey =
      actor.slackTeamId && actor.slackUserId
        ? hashedKey('slack_user', `${actor.slackTeamId}:${actor.slackUserId}`, secret)
        : null
    const organizationKey = organizationId ? hashedKey('slack_org', organizationId, secret) : null
    const distinctId = actor.userId ?? userKey ?? organizationKey
    const includeAnonymous = !(shouldDedupeIdentifiedPosthogEvents() && distinctId)
    // A failed install-id lookup only drops the anonymous copy, never the identified one.
    const anonymousInstanceId = includeAnonymous
      ? await options.resolveAnonymousInstanceId().catch(() => undefined)
      : undefined

    await captureMcpAnalyticsServerEvent({
      event,
      properties: {
        ...definedProperties(properties),
        [AnalyticsProperties.SLACK_IDENTIFIED_MEMBER]: Boolean(actor.userId),
      },
      includeAnonymous: includeAnonymous && anonymousInstanceId !== undefined,
      anonymousInstanceId,
      sessionId: userKey ?? organizationKey ?? 'slack-server',
      identifiedDistinctId: distinctId,
      identifiedOrganizationGroup: organizationId,
      identifiedPersonProfile: Boolean(actor.userId),
      organizationId,
    })
  })()
    .catch((error) => {
      console.warn('[slack] Failed to record analytics event:', event, String(error))
    })
    .finally(() => {
      pending.delete(capture)
    })
  pending.add(capture)
}

// ---------------------------------------------------------------------------
// Audiences: who a Slack interaction was for
// ---------------------------------------------------------------------------

/** The Durabull members (one per organization) a Slack user acted as. */
export interface SlackAudience {
  /** The workspace has at least one active Durabull installation. */
  connected: boolean
  members: Array<{ organizationId: string; userId: string }>
  /** Where to attribute the event when the person matches no member. */
  fallbackOrganizationId: string | null
}

type OrganizationResolution = Awaited<ReturnType<typeof resolveSlackUserOrganizations>>

export function audienceFrom(resolution: OrganizationResolution): SlackAudience {
  const { allowed, denied, installations } = resolution
  return {
    connected: installations.length > 0,
    members: allowed.map(({ installation, member }) => ({
      organizationId: installation.organizationId,
      userId: member.userId,
    })),
    fallbackOrganizationId:
      denied[0]?.installation.organizationId ?? installations[0]?.organizationId ?? null,
  }
}

/** `ok`, or why the person saw no organization's data. */
export function audienceOutcome(audience: SlackAudience): 'ok' | 'denied' | 'not_connected' {
  if (!audience.connected) return 'not_connected'
  return audience.members.length > 0 ? 'ok' : 'denied'
}

/**
 * Records one event per organization the interaction covered, so each
 * customer's usage is counted; `slack_organization_count` lets dashboards
 * de-duplicate. Someone who matched no member is recorded once.
 */
export function recordForAudience(
  event: SlackAnalyticsEvent,
  slack: SlackUserRef,
  audience: SlackAudience,
  properties: SlackAnalyticsProperties
): void {
  const withCount = {
    ...properties,
    [AnalyticsProperties.SLACK_ORGANIZATION_COUNT]: audience.members.length,
  }
  if (audience.members.length === 0) {
    recordSlackEvent(
      event,
      { ...slack, organizationId: audience.fallbackOrganizationId },
      withCount
    )
    return
  }
  for (const member of audience.members) {
    recordSlackEvent(event, { ...slack, ...member }, withCount)
  }
}

const AUDIENCE_CACHE_TTL_MS = 5 * 60_000
const AUDIENCE_CACHE_MAX = 1_000
const audienceCache = new Map<string, { audience: SlackAudience; expiresAt: number }>()

/**
 * The audience for an event that has no other reason to look the person up
 * (a link click, a help request). Each lookup reads the Slack profile, so it
 * only runs when analytics is on and is cached briefly per Slack user.
 */
export async function resolveAnalyticsAudience(slack: SlackUserRef): Promise<SlackAudience | null> {
  if (!isSlackAnalyticsEnabled()) return null
  const key = `${slack.slackTeamId}:${slack.slackUserId}`
  const cached = audienceCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.audience
  const audience = audienceFrom(
    await resolveSlackUserOrganizations(slack.slackTeamId, slack.slackUserId)
  )
  if (audienceCache.size >= AUDIENCE_CACHE_MAX) audienceCache.clear()
  audienceCache.set(key, { audience, expiresAt: Date.now() + AUDIENCE_CACHE_TTL_MS })
  return audience
}

export function clearSlackAnalyticsCache(): void {
  audienceCache.clear()
}

/** Where in Slack an interaction came from, from the payload's container. */
export function containerSurface(
  container: { type?: string; is_ephemeral?: boolean } | undefined,
  messageSurface: SlackSurfaceValue
): SlackSurfaceValue {
  if (container?.type === 'view') return SlackSurface.APP_HOME
  if (container?.is_ephemeral) return SlackSurface.EPHEMERAL
  return messageSurface
}

/** Id-free description of a Slack alert destination's settings. */
export function slackDestinationProperties(
  config: { mention?: string; userGroupIds?: string[]; threadUpdates?: boolean } | null
): SlackAnalyticsProperties {
  return {
    [AnalyticsProperties.SLACK_MENTION]: config?.mention ?? 'none',
    [AnalyticsProperties.SLACK_USER_GROUP_COUNT]: config?.userGroupIds?.length ?? 0,
    [AnalyticsProperties.SLACK_THREAD_UPDATES]: config?.threadUpdates !== false,
  }
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Errors Slack's OAuth redirect can report. The callback URL is request input,
 * so anything not on this list is recorded as `other`.
 */
const SLACK_OAUTH_ERRORS = new Set([
  'access_denied',
  'bad_redirect_uri',
  'invalid_client_id',
  'invalid_request',
  'invalid_scope',
  'invalid_team_for_non_distributed_app',
  'server_error',
  'team_added_to_org',
  'temporarily_unavailable',
  'unauthorized_client',
])

export function oauthErrorCode(code: string | null | undefined): string {
  return code && SLACK_OAUTH_ERRORS.has(code) ? code : 'other'
}

/**
 * The code of a Slack API failure. These come from Slack's own JSON `error`
 * field or Durabull's fixed codes, never from request input; the snake_case
 * check is a backstop against an unexpected shape.
 */
export function slackErrorCode(error: unknown): string {
  if (!(error instanceof SlackApiError)) return 'internal_error'
  return /^[a-z][a-z0-9_]{0,63}$/.test(error.code) ? error.code : 'other'
}

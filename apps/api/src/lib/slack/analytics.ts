import {
  captureMcpAnalyticsServerEvent,
  hashTelemetryIdentifier,
  shouldDedupeIdentifiedPosthogEvents,
  tryGetServerAnalyticsOptions,
} from '@durabull/analytics/server'
import { SlackApiError } from './client'

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

const pending = new Set<Promise<void>>()

/** Test helper: waits for every analytics capture started so far. */
export async function flushSlackAnalytics(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending])
}

export type SlackAnalyticsProperties = Record<string, string | number | boolean | null | undefined>

function slackUserKey(actor: SlackAnalyticsActor, secret: string | null): string | null {
  if (!secret || !actor.slackTeamId || !actor.slackUserId) return null
  return hashTelemetryIdentifier(`slack_user:${actor.slackTeamId}:${actor.slackUserId}`, secret)
}

function definedProperties(properties: SlackAnalyticsProperties): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined))
}

/**
 * Records Slack app activity in PostHog.
 *
 * Identified events use the same distinct id and organization group as the
 * browser (`identifyUser` / `identifyOrganization`), so Slack usage lines up
 * with each customer's web activity. Slack users that are not matched to a
 * Durabull member get a hashed per-workspace key instead. Self-hosted installs
 * also send the anonymous, sanitized copy like every other server event.
 *
 * Fire-and-forget: analytics never slows down or fails a Slack request.
 */
export function recordSlackEvent(
  event: string,
  actor: SlackAnalyticsActor,
  properties: SlackAnalyticsProperties = {}
): void {
  const options = tryGetServerAnalyticsOptions()
  if (!options?.enabled) return

  const capture = (async () => {
    const secret = options.hmacSecret
    const organizationId = actor.organizationId ?? null
    const userKey = slackUserKey(actor, secret)
    const distinctId = actor.userId ?? userKey ?? organizationId
    const includeAnonymous = !(shouldDedupeIdentifiedPosthogEvents() && distinctId)
    // A failed install-id lookup only drops the anonymous copy, never the identified one.
    const anonymousInstanceId = includeAnonymous
      ? await options.resolveAnonymousInstanceId().catch(() => undefined)
      : undefined
    const sessionId =
      userKey ??
      (organizationId && secret
        ? hashTelemetryIdentifier(`slack_org:${organizationId}`, secret)
        : null) ??
      'slack-server'

    await captureMcpAnalyticsServerEvent({
      event,
      properties: {
        ...definedProperties(properties),
        slack_identified_member: Boolean(actor.userId),
      },
      includeAnonymous: includeAnonymous && anonymousInstanceId !== undefined,
      anonymousInstanceId,
      sessionId,
      identifiedDistinctId: distinctId,
      identifiedOrganizationGroup: organizationId,
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

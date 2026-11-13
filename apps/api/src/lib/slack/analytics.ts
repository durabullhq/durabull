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
    const anonymousInstanceId = includeAnonymous
      ? await options.resolveAnonymousInstanceId()
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
      includeAnonymous,
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
 * Keeps an error code only when it looks like a fixed identifier
 * (`channel_not_found`), so free text from a URL or response never reaches analytics.
 */
export function safeErrorCode(code: string | null | undefined): string {
  return code && /^[a-z0-9_.]{1,64}$/.test(code) ? code : 'other'
}

/** A Slack error code safe to record. */
export function slackErrorCode(error: unknown): string {
  if (error instanceof SlackApiError) return safeErrorCode(error.code)
  return 'internal_error'
}

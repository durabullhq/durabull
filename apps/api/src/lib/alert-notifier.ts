import { eq, getDb, organization, type AlertEvent, type RedisConnection } from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { env } from '@durabull/env'

export interface NotificationChannel {
  type: 'email'
  target: string
}

export async function dispatchAlertNotification(
  event: AlertEvent,
  channels: NotificationChannel[],
  connection: RedisConnection,
  ruleName: string
): Promise<void> {
  const organizationSlug = await getOrganizationSlug(event.organizationId)

  for (const channel of channels) {
    switch (channel.type) {
      case 'email':
        await sendAlertEmail(channel.target, event, connection, ruleName, organizationSlug)
        break
      default:
        console.warn(`[alert-notifier] Unknown channel type: ${String(channel)}`)
    }
  }
}

async function sendAlertEmail(
  to: string,
  event: AlertEvent,
  connection: RedisConnection,
  ruleName: string,
  organizationSlug: string | null
): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('[alert-notifier] RESEND_API_KEY not configured, skipping email')
    return
  }

  const { sendAlertNotificationEmail } = await import('@durabull/email')
  const { dashboardUrl, muteUrl } = buildAlertAppUrls({
    appBaseUrl: env.APP_BASE_URL,
    organizationSlug,
    connectionId: connection.id,
    queueName: event.queueName,
    alertRuleId: event.alertRuleId,
  })

  await sendAlertNotificationEmail({
    to,
    alertRuleName: ruleName,
    queueName: event.queueName,
    connectionName: connection.name,
    summary: event.summary,
    firedAt: event.firedAt,
    context: (event.context ?? {}) as Record<string, unknown>,
    dashboardUrl,
    muteUrl,
  })
}

async function getOrganizationSlug(organizationId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  return rows[0]?.slug ?? null
}

export function buildAlertAppUrls({
  appBaseUrl,
  organizationSlug,
  connectionId,
  queueName,
  alertRuleId,
}: {
  appBaseUrl: string
  organizationSlug: string | null
  connectionId: string
  queueName: string
  alertRuleId: string
}): { dashboardUrl: string; muteUrl: string } {
  const baseUrl = appBaseUrl.replace(/\/+$/, '')

  if (!organizationSlug) {
    console.warn('[alert-notifier] Missing organization slug for alert email links')
    return {
      dashboardUrl: baseUrl,
      muteUrl: baseUrl,
    }
  }

  const orgSegment = encodeURIComponent(organizationSlug)
  const connectionSegment = encodeURIComponent(connectionId)
  const queueSegment = encodeURIComponent(queueName)
  const ruleQuery = new URLSearchParams({ ruleId: alertRuleId }).toString()

  return {
    dashboardUrl: `${baseUrl}/${orgSegment}/c/${connectionSegment}/queues/${queueSegment}`,
    muteUrl: `${baseUrl}/${orgSegment}/c/${connectionSegment}/alerts?${ruleQuery}`,
  }
}

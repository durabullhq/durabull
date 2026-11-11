import type { AlertRuleType } from '@durabull/dal'
import { env } from '@durabull/env'
import { randomUUID } from 'node:crypto'
import { deliverWebhook } from './alert-webhook-client'
import { buildAlertWebhookPayload, serializeAlertWebhookPayload } from './alert-webhook-payload'

export interface TestWebhookDeliveryInput {
  url: string
  secret?: string | null
  organizationId: string
  organizationSlug: string | null
  connectionId: string
  connectionName: string
  ruleId?: string
  ruleName?: string
  ruleType?: AlertRuleType | string
  queueName?: string
}

export async function sendTestWebhookDelivery(input: TestWebhookDeliveryInput) {
  const eventId = randomUUID()
  const deliveryId = randomUUID()
  const now = new Date()

  const payload = buildAlertWebhookPayload({
    eventType: 'alert.test',
    eventId,
    deliveryId,
    occurredAt: now,
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
    connection: {
      id: input.connectionId,
      name: input.connectionName,
    } as never,
    ruleId: input.ruleId ?? 'test-rule',
    ruleName: input.ruleName ?? 'Webhook test',
    ruleType: input.ruleType ?? 'job_failed',
    queueName: input.queueName ?? 'example-queue',
    summary: 'This is a test alert from Durabull.',
    context: {
      test: true,
      message: 'Webhook delivery test payload.',
    },
    firedAt: now,
    dedupeKey: null,
    appBaseUrl: env.APP_BASE_URL,
  })

  const body = serializeAlertWebhookPayload(payload)
  return deliverWebhook({
    url: input.url,
    body,
    secret: input.secret,
    deliveryId,
    idempotencyKey: eventId,
  })
}

import {
  getTelemetryStatusFromOptions,
  isDurabullTelemetryCollectConfigured,
  resolveCollectRuntimeContext,
  TELEMETRY_COLLECT_SIGNATURE_HEADER,
  TELEMETRY_COLLECT_TIMESTAMP_HEADER,
  TELEMETRY_DISCLOSURE_URL,
  tryGetServerAnalyticsOptions,
  validateTelemetryPayload,
  verifyTelemetryCollectSignature,
} from '@durabull/analytics/server'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { enqueueTelemetryCollectBatch } from './telemetry-collect-queue'
import { enqueueTelemetryEvent } from './telemetry-events-queue'

const MAX_COLLECT_EVENTS_PER_BATCH = 50

const telemetryPayloadSchema = z.object({
  event: z.string().min(1).max(128),
  properties: z.record(z.unknown()).optional(),
  sessionId: z.string().min(1).max(128),
  timestamp: z.string().datetime().optional(),
})

const telemetryCollectEventSchema = z.object({
  event: z.string().min(1).max(128),
  properties: z.record(z.unknown()).default({}),
  sessionId: z.string().min(1).max(128),
  timestamp: z.string().datetime().optional(),
})

const telemetryCollectRuntimeSchema = z.object({
  authless: z.boolean(),
  env_connections: z.boolean(),
  environment: z.string().min(1).max(64),
  persistence: z.string().min(1).max(64),
  stateless: z.boolean(),
  // Added in the deployment-dimensions release; older self-hosted instances omit them. A sent
  // `deployment` is stripped: the collector always stamps `self_hosted`.
  distribution: z.string().min(1).max(32).optional(),
  release_channel: z.string().min(1).max(64).optional(),
  api_version: z.string().min(1).max(64).optional(),
})

const telemetryCollectPayloadSchema = z.object({
  sentAt: z.string().datetime().optional(),
  instanceId: z.string().min(16).max(128),
  runtime: telemetryCollectRuntimeSchema,
  events: z.array(telemetryCollectEventSchema).min(1).max(MAX_COLLECT_EVENTS_PER_BATCH),
})

export function getTelemetryStatus() {
  const options = tryGetServerAnalyticsOptions()
  if (!options) {
    return {
      enabled: false,
      collectionRequired: true as const,
      dedupeIdentifiedPosthogEvents: false,
      disclosureUrl: TELEMETRY_DISCLOSURE_URL,
      deployment: 'self_hosted' as const,
      distribution: 'unknown' as const,
    }
  }

  return getTelemetryStatusFromOptions(options)
}

export function isDurabullTelemetryCollectEnabled(): boolean {
  const options = tryGetServerAnalyticsOptions()
  return (options?.collectEnabled && options.enabled) ?? false
}

const telemetryRoutes = new Hono()
  .get('/status', (c) => c.json(getTelemetryStatus()))
  .post('/collect', async (c) => {
    if (!isDurabullTelemetryCollectEnabled()) {
      return c.json({ error: 'Not Found' }, 404)
    }

    const options = tryGetServerAnalyticsOptions()
    const rawBody = await c.req.text()

    // Self-hosted builds ship without a signing secret, so unsigned batches are accepted and
    // bounded by the rate limiter, body limit, event allowlist and property sanitizer instead.
    // The signature is therefore not an authentication boundary: any sender can omit it. A batch
    // that does carry signature headers must still verify, so a misconfigured or tampered
    // signed sender is rejected instead of silently accepted.
    const timestampHeader = c.req.header(TELEMETRY_COLLECT_TIMESTAMP_HEADER)
    const signatureHeader = c.req.header(TELEMETRY_COLLECT_SIGNATURE_HEADER)
    const collectSigningSecret = options?.collectSigningSecret
    if (collectSigningSecret && (timestampHeader || signatureHeader)) {
      const verification = verifyTelemetryCollectSignature({
        secret: collectSigningSecret,
        timestampHeader,
        signatureHeader,
        rawBody,
      })

      if (!verification.ok) {
        return c.json({ error: 'Unauthorized telemetry collect request' }, 401)
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'Invalid telemetry collect payload' }, 400)
    }

    const payloadResult = telemetryCollectPayloadSchema.safeParse(parsed)
    if (!payloadResult.success) {
      return c.json({ error: 'Invalid telemetry collect payload' }, 400)
    }

    const payload = payloadResult.data
    if (!options || !isDurabullTelemetryCollectConfigured(options)) {
      return c.json({ error: 'Telemetry collection is not configured' }, 503)
    }

    const runtime = resolveCollectRuntimeContext(payload.runtime)
    for (const event of payload.events) {
      const validated = validateTelemetryPayload(event.event, event.properties, runtime)
      if (!validated.ok) {
        if (validated.error === 'unknown_event') {
          return c.json({ error: 'Unknown telemetry event' }, 400)
        }
        return c.json({ error: 'Invalid telemetry properties' }, 400)
      }
    }

    const enqueued = enqueueTelemetryCollectBatch({
      instanceId: payload.instanceId,
      sentAt: payload.sentAt,
      events: payload.events,
      clientRuntime: payload.runtime,
    })

    if (!enqueued) {
      return c.json({ error: 'Telemetry collect queue is full' }, 503)
    }

    return c.json({ accepted: true }, 202)
  })
  .post('/events', zValidator('json', telemetryPayloadSchema), async (c) => {
    const status = getTelemetryStatus()
    if (!status.enabled) {
      return c.json({ accepted: false, enabled: false }, 202)
    }

    const body = c.req.valid('json')
    const options = tryGetServerAnalyticsOptions()
    if (!options) {
      return c.json({ error: 'Telemetry is not configured' }, 503)
    }

    const validated = validateTelemetryPayload(
      body.event,
      body.properties ?? {},
      options.getRuntimeContext()
    )
    if (!validated.ok) {
      if (validated.error === 'unknown_event') {
        return c.json({ error: 'Unknown telemetry event' }, 400)
      }
      return c.json({ error: 'Invalid telemetry properties' }, 400)
    }

    if (options.collectEnabled && !isDurabullTelemetryCollectConfigured(options)) {
      return c.json({ error: 'Telemetry collection is not configured' }, 503)
    }

    const enqueued = enqueueTelemetryEvent({
      event: validated.event,
      properties: validated.properties,
      sessionId: body.sessionId,
      timestamp: body.timestamp ?? new Date().toISOString(),
    })

    if (!enqueued) {
      return c.json({ error: 'Telemetry event queue is full' }, 503)
    }

    return c.json({ accepted: true }, 202)
  })

export default telemetryRoutes

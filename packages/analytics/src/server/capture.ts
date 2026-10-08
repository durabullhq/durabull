import {
  tryGetServerAnalyticsOptions,
  type ServerAnalyticsOptions,
  type ServerAnalyticsRuntimeContext,
} from './config'
import {
  signTelemetryCollectBody,
  TELEMETRY_COLLECT_SIGNATURE_HEADER,
  TELEMETRY_COLLECT_TIMESTAMP_HEADER,
} from './collect-auth'
import {
  hashIdentifiedOrganizationDistinctId,
  hashIdentifiedUserDistinctId,
  hashTelemetryIdentifier,
} from './identifiers'
import {
  POSTHOG_FETCH_TIMEOUT_MS,
  resolvePosthogBatchUrl,
  sendPosthogBatch,
  type PosthogBatchCapture,
  type PosthogBatchClientConfig,
} from './posthog-batch'
import { validateTelemetryPayload } from './validate'

/**
 * Maximum drift (past or future) allowed for client-supplied event timestamps on
 * public anonymous ingest paths (`/collect`, `/events`). Untrusted clients can
 * otherwise backdate or future-date events to pollute analytics time series.
 */
const MAX_COLLECT_TIMESTAMP_SKEW_MS = 24 * 60 * 60 * 1000

/** Clamp a client-supplied timestamp to server time when it is missing or outside the skew window. */
function resolveCollectTimestamp(clientTimestamp: string | undefined, nowMs: number): string {
  if (!clientTimestamp) return new Date(nowMs).toISOString()

  const parsed = Date.parse(clientTimestamp)
  if (Number.isNaN(parsed)) return new Date(nowMs).toISOString()
  if (Math.abs(parsed - nowMs) > MAX_COLLECT_TIMESTAMP_SKEW_MS) {
    return new Date(nowMs).toISOString()
  }

  return clientTimestamp
}

interface DurabullPosthogIngestConfig extends PosthogBatchClientConfig {
  hmacSecret: string
}

function getOptions(): ServerAnalyticsOptions | null {
  return tryGetServerAnalyticsOptions()
}

export function isDurabullTelemetryCollectConfigured(options: ServerAnalyticsOptions): boolean {
  return getDurabullPosthogIngestConfig(options) !== null
}

function getDurabullPosthogIngestConfig(
  options: ServerAnalyticsOptions
): DurabullPosthogIngestConfig | null {
  const posthogKey = options.durabullTelemetryPosthogKey
  const hmacSecret = options.hmacSecret
  const posthogBatchUrl = resolvePosthogBatchUrl(options.durabullTelemetryPosthogHost ?? undefined)

  if (!posthogKey || !hmacSecret || !posthogBatchUrl) return null

  return { hmacSecret, posthogBatchUrl, posthogKey }
}

function getIdentifiedPosthogConfig(
  options: ServerAnalyticsOptions
): PosthogBatchClientConfig | null {
  const posthogKey = options.appPosthogKey
  if (!posthogKey) return null

  const posthogBatchUrl = resolvePosthogBatchUrl(
    options.appPosthogHost ?? options.durabullTelemetryPosthogHost ?? undefined
  )
  if (!posthogBatchUrl) return null

  return { posthogBatchUrl, posthogKey }
}

function buildAnonymousCapture(input: {
  anonymousInstanceId: string
  sessionId: string
  event: string
  properties: Record<string, string | number | boolean | null>
  timestamp: string
  hmacSecret: string
}): PosthogBatchCapture {
  const distinctId = hashTelemetryIdentifier(
    `${input.anonymousInstanceId}:${input.sessionId}`,
    input.hmacSecret
  )
  const instanceKey = hashTelemetryIdentifier(input.anonymousInstanceId, input.hmacSecret)

  return {
    event: input.event,
    properties: {
      ...input.properties,
      instance_key: instanceKey,
    },
    distinctId,
    processPersonProfile: false,
    timestamp: input.timestamp,
  }
}

function buildIdentifiedCapture(input: {
  event: string
  properties: Record<string, string | number | boolean | null>
  distinctId: string
  organizationId?: string | null
  timestamp?: string
  hmacSecret: string | null
}): PosthogBatchCapture {
  const organizationGroup =
    input.organizationId && input.hmacSecret
      ? hashIdentifiedOrganizationDistinctId(input.organizationId, input.hmacSecret)
      : null

  return {
    event: input.event,
    properties: input.properties,
    distinctId: input.distinctId,
    organizationId: organizationGroup,
    processPersonProfile: true,
    timestamp: input.timestamp,
  }
}

function isSamePosthogConfig(
  left: PosthogBatchClientConfig | null,
  right: PosthogBatchClientConfig | null
): left is PosthogBatchClientConfig {
  if (!left || !right) return false
  return left.posthogBatchUrl === right.posthogBatchUrl && left.posthogKey === right.posthogKey
}

async function forwardAnonymousToCloudCollect(input: {
  cloudCollectUrl: string
  collectSigningSecret: string
  anonymousInstanceId: string
  event: string
  properties: Record<string, string | number | boolean | null>
  sessionId: string
  timestamp: string
  runtimeContext: ServerAnalyticsRuntimeContext
}): Promise<void> {
  const sentAt = new Date().toISOString()
  const rawBody = JSON.stringify({
    sentAt,
    instanceId: input.anonymousInstanceId,
    runtime: input.runtimeContext,
    events: [
      {
        event: input.event,
        properties: input.properties,
        sessionId: input.sessionId,
        timestamp: input.timestamp,
      },
    ],
  })
  const signedAt = Math.floor(Date.now() / 1000)
  const { signature, timestamp } = signTelemetryCollectBody(
    input.collectSigningSecret,
    signedAt,
    rawBody
  )

  const response = await fetch(input.cloudCollectUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [TELEMETRY_COLLECT_TIMESTAMP_HEADER]: timestamp,
      [TELEMETRY_COLLECT_SIGNATURE_HEADER]: signature,
    },
    body: rawBody,
    redirect: 'manual',
    signal: AbortSignal.timeout(POSTHOG_FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    console.warn(`[analytics] cloud collect forward failed with status ${response.status}`)
  }

  await response.body?.cancel()
}

export async function captureAnonymousServerEvent(input: {
  anonymousInstanceId: string
  event: string
  properties: Record<string, unknown>
  sessionId: string
  timestamp?: string
}): Promise<void> {
  const options = getOptions()
  if (!options?.enabled) return

  const runtimeContext = options.getRuntimeContext()
  const validated = validateTelemetryPayload(input.event, input.properties, runtimeContext)
  if (!validated.ok) return

  const timestamp = resolveCollectTimestamp(input.timestamp, Date.now())

  if (options.collectEnabled) {
    const config = getDurabullPosthogIngestConfig(options)
    if (!config) return

    await sendPosthogBatch(
      config,
      [
        buildAnonymousCapture({
          anonymousInstanceId: input.anonymousInstanceId,
          sessionId: input.sessionId,
          event: validated.event,
          properties: validated.properties,
          timestamp,
          hmacSecret: config.hmacSecret,
        }),
      ],
      { runtimeContext, mergeRuntime: true }
    )
    return
  }

  if (!options.collectSigningSecret) {
    console.warn('[analytics] cloud collect forward skipped: missing collect signing secret')
    return
  }

  await forwardAnonymousToCloudCollect({
    cloudCollectUrl: options.cloudCollectUrl,
    collectSigningSecret: options.collectSigningSecret,
    anonymousInstanceId: input.anonymousInstanceId,
    event: validated.event,
    properties: validated.properties,
    sessionId: input.sessionId,
    timestamp,
    runtimeContext,
  })
}

export async function captureMcpAnalyticsServerEvent(input: {
  event: string
  properties: Record<string, unknown>
  includeAnonymous: boolean
  anonymousInstanceId?: string
  sessionId?: string
  identifiedDistinctId?: string | null
  organizationId?: string | null
  timestamp?: string
}): Promise<void> {
  const options = getOptions()
  if (!options?.enabled) return

  const runtimeContext = options.getRuntimeContext()
  const validated = validateTelemetryPayload(input.event, input.properties, runtimeContext)
  if (!validated.ok) return

  const timestamp = resolveCollectTimestamp(input.timestamp, Date.now())
  const shouldCaptureAnonymous =
    input.includeAnonymous && !!input.anonymousInstanceId && !!input.sessionId
  const shouldCaptureIdentified = !!input.identifiedDistinctId

  if (!shouldCaptureAnonymous && !shouldCaptureIdentified) {
    return
  }

  if (options.collectEnabled) {
    const anonymousConfig = shouldCaptureAnonymous ? getDurabullPosthogIngestConfig(options) : null
    const identifiedConfig = shouldCaptureIdentified ? getIdentifiedPosthogConfig(options) : null
    const anonymousCapture =
      shouldCaptureAnonymous && anonymousConfig
        ? buildAnonymousCapture({
            anonymousInstanceId: input.anonymousInstanceId!,
            sessionId: input.sessionId!,
            event: validated.event,
            properties: validated.properties,
            timestamp,
            hmacSecret: anonymousConfig.hmacSecret,
          })
        : null
    const identifiedCapture =
      shouldCaptureIdentified && identifiedConfig
        ? buildIdentifiedCapture({
            event: validated.event,
            properties: validated.properties,
            distinctId: input.identifiedDistinctId!,
            organizationId: input.organizationId ?? null,
            timestamp,
            hmacSecret: options.hmacSecret,
          })
        : null

    if (
      anonymousCapture &&
      identifiedCapture &&
      isSamePosthogConfig(anonymousConfig, identifiedConfig)
    ) {
      await sendPosthogBatch(anonymousConfig, [anonymousCapture, identifiedCapture], {
        runtimeContext,
        mergeRuntime: true,
      })
      return
    }

    const tasks: Promise<boolean>[] = []
    if (anonymousCapture && anonymousConfig) {
      tasks.push(
        sendPosthogBatch(anonymousConfig, [anonymousCapture], {
          runtimeContext,
          mergeRuntime: true,
        })
      )
    }
    if (identifiedCapture && identifiedConfig) {
      tasks.push(
        sendPosthogBatch(identifiedConfig, [identifiedCapture], {
          runtimeContext,
          mergeRuntime: true,
        })
      )
    }
    if (tasks.length > 0) {
      await Promise.all(tasks)
    }
    return
  }

  const tasks: Promise<void>[] = []
  if (shouldCaptureAnonymous) {
    if (!options.collectSigningSecret) {
      console.warn('[analytics] cloud collect forward skipped: missing collect signing secret')
    } else {
      tasks.push(
        forwardAnonymousToCloudCollect({
          cloudCollectUrl: options.cloudCollectUrl,
          collectSigningSecret: options.collectSigningSecret,
          anonymousInstanceId: input.anonymousInstanceId!,
          event: validated.event,
          properties: validated.properties,
          sessionId: input.sessionId!,
          timestamp,
          runtimeContext,
        })
      )
    }
  }

  if (shouldCaptureIdentified) {
    const identifiedConfig = getIdentifiedPosthogConfig(options)
    if (identifiedConfig) {
      tasks.push(
        sendPosthogBatch(
          identifiedConfig,
          [
            buildIdentifiedCapture({
              event: validated.event,
              properties: validated.properties,
              distinctId: input.identifiedDistinctId!,
              organizationId: input.organizationId ?? null,
              timestamp,
              hmacSecret: options.hmacSecret,
            }),
          ],
          { runtimeContext, mergeRuntime: true }
        ).then(() => {})
      )
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
}

export interface TelemetryCollectEventInput {
  event: string
  properties: Record<string, unknown>
  sessionId: string
  timestamp?: string
}

export type IngestCollectBatchResult =
  | { ok: true }
  | {
      ok: false
      error:
        | 'disabled'
        | 'not_configured'
        | 'unknown_event'
        | 'invalid_properties'
        | 'upstream_rejected'
        | 'upstream_unavailable'
    }

export async function ingestTelemetryCollectBatch(input: {
  instanceId: string
  sentAt?: string
  events: TelemetryCollectEventInput[]
  clientRuntime?: ServerAnalyticsRuntimeContext
}): Promise<IngestCollectBatchResult> {
  const options = getOptions()
  if (!options?.enabled) {
    return { ok: false, error: 'disabled' }
  }

  const config = getDurabullPosthogIngestConfig(options)
  if (!config) {
    return { ok: false, error: 'not_configured' }
  }

  const runtimeContext = input.clientRuntime ?? options.getRuntimeContext()
  const nowMs = Date.now()
  const batch: PosthogBatchCapture[] = []

  for (const event of input.events) {
    const validated = validateTelemetryPayload(event.event, event.properties, runtimeContext)
    if (!validated.ok) {
      return { ok: false, error: validated.error }
    }

    batch.push(
      buildAnonymousCapture({
        anonymousInstanceId: input.instanceId,
        sessionId: event.sessionId,
        event: validated.event,
        properties: validated.properties,
        timestamp: resolveCollectTimestamp(event.timestamp ?? input.sentAt, nowMs),
        hmacSecret: config.hmacSecret,
      })
    )
  }

  try {
    const accepted = await sendPosthogBatch(config, batch, { mergeRuntime: false })
    return accepted ? { ok: true } : { ok: false, error: 'upstream_rejected' }
  } catch {
    return { ok: false, error: 'upstream_unavailable' }
  }
}

export function shouldDedupeIdentifiedPosthogEvents(): boolean {
  return getOptions()?.dedupeIdentifiedPosthogEvents ?? false
}

export function resolveIdentifiedDistinctIds(input: {
  userId?: string | null
  organizationId?: string | null
}): { distinctId: string | null; organizationGroup: string | null } {
  const options = getOptions()
  const secret = options?.hmacSecret
  if (!secret) {
    return { distinctId: null, organizationGroup: null }
  }

  if (input.userId) {
    return {
      distinctId: hashIdentifiedUserDistinctId(input.userId, secret),
      organizationGroup: input.organizationId
        ? hashIdentifiedOrganizationDistinctId(input.organizationId, secret)
        : null,
    }
  }

  if (input.organizationId) {
    const organizationGroup = hashIdentifiedOrganizationDistinctId(input.organizationId, secret)
    return {
      distinctId: organizationGroup,
      organizationGroup,
    }
  }

  return { distinctId: null, organizationGroup: null }
}

import { createHmac, timingSafeEqual } from 'node:crypto'

export const TELEMETRY_COLLECT_SIGNATURE_TOLERANCE_SEC = 300
export const TELEMETRY_COLLECT_TIMESTAMP_HEADER = 'X-Durabull-Telemetry-Timestamp'
export const TELEMETRY_COLLECT_SIGNATURE_HEADER = 'X-Durabull-Telemetry-Signature'

const DEFAULT_REPLAY_MAX_ENTRIES = 4_096

interface TelemetryCollectReplayCacheEntry {
  expiresAtMs: number
}

export function createTelemetryCollectReplayCache(options?: { maxEntries?: number }) {
  const maxEntries = options?.maxEntries ?? DEFAULT_REPLAY_MAX_ENTRIES
  const store = new Map<string, TelemetryCollectReplayCacheEntry>()

  function consume(
    signature: string,
    nowMs: number,
    signatureExpiresAtMs: number
  ): 'fresh' | 'replay' {
    const normalized = signature.trim()
    const existing = store.get(normalized)
    if (existing) {
      if (existing.expiresAtMs < nowMs) {
        store.delete(normalized)
        // Expired; fall through to re-insert as fresh.
      } else {
        return 'replay'
      }
    }

    if (store.size >= maxEntries) {
      for (const [key, entry] of store) {
        if (entry.expiresAtMs < nowMs) {
          store.delete(key)
        }
      }
    }

    if (store.size >= maxEntries) {
      const oldestKey = store.keys().next().value
      if (oldestKey) store.delete(oldestKey)
    }

    store.set(normalized, { expiresAtMs: signatureExpiresAtMs })
    return 'fresh'
  }

  function reset(): void {
    store.clear()
  }

  return { consume, reset }
}

const defaultReplayCache = createTelemetryCollectReplayCache()

/** Test-only: clear replay protection between cases. */
export function resetTelemetryCollectReplayCacheForTests(): void {
  if (process.env.NODE_ENV !== 'test') return
  defaultReplayCache.reset()
}

export function signTelemetryCollectBody(
  secret: string,
  timestamp: number,
  rawBody: string
): { signature: string; timestamp: string } {
  const timestampValue = String(timestamp)
  const digest = createHmac('sha256', secret).update(`${timestampValue}.${rawBody}`).digest('hex')

  return {
    signature: `sha256=${digest}`,
    timestamp: timestampValue,
  }
}

export function verifyTelemetryCollectSignature(input: {
  secret: string
  timestampHeader: string | undefined
  signatureHeader: string | undefined
  rawBody: string
  nowSec?: number
}): { ok: true } | { ok: false; error: 'missing' | 'invalid' | 'expired' | 'replay' } {
  const { secret, timestampHeader, signatureHeader, rawBody } = input
  if (!timestampHeader?.trim() || !signatureHeader?.trim()) {
    return { ok: false, error: 'missing' }
  }

  const timestampHeaderValue = timestampHeader.trim()
  const timestampSec = Number(timestampHeaderValue)
  if (!Number.isFinite(timestampSec) || !/^\d+$/.test(timestampHeaderValue)) {
    return { ok: false, error: 'invalid' }
  }

  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - timestampSec) > TELEMETRY_COLLECT_SIGNATURE_TOLERANCE_SEC) {
    return { ok: false, error: 'expired' }
  }

  const expected = signTelemetryCollectBody(secret, timestampSec, rawBody).signature
  const provided = signatureHeader.trim()

  try {
    const expectedBuffer = Buffer.from(expected)
    const providedBuffer = Buffer.from(provided)
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return { ok: false, error: 'invalid' }
    }
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const signatureExpiresAtMs = (timestampSec + TELEMETRY_COLLECT_SIGNATURE_TOLERANCE_SEC) * 1000
  if (defaultReplayCache.consume(provided, nowSec * 1000, signatureExpiresAtMs) === 'replay') {
    return { ok: false, error: 'replay' }
  }

  return { ok: true }
}

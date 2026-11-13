import { createHmac, timingSafeEqual } from 'node:crypto'

/** Slack recommends rejecting requests older than five minutes to stop replays. */
export const SLACK_SIGNATURE_MAX_AGE_SECONDS = 60 * 5

export type SlackSignatureResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'stale_timestamp' | 'bad_signature' }

/**
 * Verifies the `X-Slack-Signature` header against the raw request body using
 * the app's signing secret (v0 HMAC-SHA256 over `v0:{timestamp}:{body}`).
 */
export function verifySlackSignature(input: {
  signingSecret: string
  timestamp: string | null | undefined
  signature: string | null | undefined
  rawBody: string
  nowSeconds?: number
}): SlackSignatureResult {
  const { timestamp, signature } = input
  if (!timestamp || !signature) return { ok: false, reason: 'missing_headers' }

  const timestampSeconds = Number.parseInt(timestamp, 10)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(now - timestampSeconds) > SLACK_SIGNATURE_MAX_AGE_SECONDS
  ) {
    return { ok: false, reason: 'stale_timestamp' }
  }

  const expected = `v0=${createHmac('sha256', input.signingSecret)
    .update(`v0:${timestamp}:${input.rawBody}`)
    .digest('hex')}`
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const actualBuffer = Buffer.from(signature, 'utf8')
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { ok: false, reason: 'bad_signature' }
  }
  return { ok: true }
}

/** Test helper and documentation of the scheme: signs a body the way Slack does. */
export function signSlackRequest(input: {
  signingSecret: string
  timestamp: number
  rawBody: string
}): string {
  return `v0=${createHmac('sha256', input.signingSecret)
    .update(`v0:${input.timestamp}:${input.rawBody}`)
    .digest('hex')}`
}

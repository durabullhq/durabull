import { createHmac } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import http from 'node:http'
import https from 'node:https'
import {
  resolveAllowedWebhookEndpoint,
  type ResolvedWebhookEndpoint,
  WebhookUrlError,
} from './alert-webhook-url'

export const WEBHOOK_TIMEOUT_MS = 10_000
export const WEBHOOK_SIGNATURE_TOLERANCE_SEC = 300
export const WEBHOOK_DELIVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const WEBHOOK_DELIVERY_ABANDONED_MESSAGE =
  'Webhook delivery abandoned after 7 days of failed attempts.'

export function isWebhookDeliveryExpired(
  createdAt: Date | string,
  nowMs: number = Date.now()
): boolean {
  const createdMs = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs)) return true
  return nowMs - createdMs >= WEBHOOK_DELIVERY_MAX_AGE_MS
}

export interface WebhookDeliveryRequest {
  url: string
  body: string
  secret?: string | null
  deliveryId: string
  idempotencyKey: string
}

export interface WebhookDeliveryResult {
  success: boolean
  httpStatus: number | null
  durationMs: number
  error?: string
  retryable: boolean
  responseBodySnippet?: string
}

export class WebhookDeliveryError extends Error {
  readonly httpStatus: number | null
  readonly retryable: boolean
  readonly responseBodySnippet?: string

  constructor(
    message: string,
    options: { httpStatus?: number | null; retryable: boolean; responseBodySnippet?: string }
  ) {
    super(message)
    this.name = 'WebhookDeliveryError'
    this.httpStatus = options.httpStatus ?? null
    this.retryable = options.retryable
    this.responseBodySnippet = options.responseBodySnippet
  }
}

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string
): { signature: string; timestamp: string } {
  const timestampValue = String(timestamp)
  const digest = createHmac('sha256', secret).update(`${timestampValue}.${body}`).digest('hex')
  return {
    signature: `sha256=${digest}`,
    timestamp: timestampValue,
  }
}

export function classifyWebhookHttpStatus(status: number): { retryable: boolean; message: string } {
  if (status >= 200 && status < 300) {
    return { retryable: false, message: 'Delivered successfully.' }
  }
  if (status === 408 || status === 429 || status >= 500) {
    return { retryable: true, message: `Webhook endpoint returned HTTP ${status}.` }
  }
  return { retryable: false, message: `Webhook endpoint returned HTTP ${status}.` }
}

export async function deliverWebhook(
  request: WebhookDeliveryRequest
): Promise<WebhookDeliveryResult> {
  const startedAt = Date.now()

  let endpoint: ResolvedWebhookEndpoint
  try {
    endpoint = await resolveAllowedWebhookEndpoint(request.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      error: message,
      retryable: false,
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Durabull-Alerts/1.0',
    'X-Durabull-Delivery-Id': request.deliveryId,
    'Idempotency-Key': request.idempotencyKey,
  }

  if (request.secret) {
    const signed = signWebhookPayload(request.secret, Math.floor(Date.now() / 1000), request.body)
    headers['X-Durabull-Signature'] = signed.signature
    headers['X-Durabull-Timestamp'] = signed.timestamp
  }

  try {
    const { statusCode, responseBodySnippet } = await postPinnedWebhook(
      endpoint,
      headers,
      request.body,
      {
        timeoutMs: WEBHOOK_TIMEOUT_MS,
      }
    )
    const durationMs = Date.now() - startedAt
    const classification = classifyWebhookHttpStatus(statusCode)

    if (statusCode >= 200 && statusCode < 300) {
      return {
        success: true,
        httpStatus: statusCode,
        durationMs,
        retryable: false,
        responseBodySnippet,
      }
    }

    return {
      success: false,
      httpStatus: statusCode,
      durationMs,
      error: classification.message,
      retryable: classification.retryable,
      responseBodySnippet,
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        httpStatus: null,
        durationMs,
        error: `Webhook request timed out after ${WEBHOOK_TIMEOUT_MS}ms.`,
        retryable: true,
      }
    }

    return {
      success: false,
      httpStatus: null,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    }
  }
}

export async function deliverWebhookOrThrow(
  request: WebhookDeliveryRequest
): Promise<{ httpStatus: number; durationMs: number; responseBodySnippet?: string }> {
  const result = await deliverWebhook(request)
  if (result.success && result.httpStatus !== null) {
    return {
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      responseBodySnippet: result.responseBodySnippet,
    }
  }

  throw new WebhookDeliveryError(result.error ?? 'Webhook delivery failed.', {
    httpStatus: result.httpStatus,
    retryable: result.retryable,
    responseBodySnippet: result.responseBodySnippet,
  })
}

function postPinnedWebhook(
  endpoint: ResolvedWebhookEndpoint,
  headers: Record<string, string>,
  body: string,
  options: { timeoutMs: number }
): Promise<{ statusCode: number; responseBodySnippet?: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = endpoint.protocol === 'https:'
    const client = isHttps ? https : http
    const bodyBytes = Buffer.byteLength(body, 'utf8')

    const req = client.request(
      {
        host: endpoint.pinnedAddress,
        port: endpoint.port,
        path: endpoint.path,
        method: 'POST',
        headers: {
          ...headers,
          Host: endpoint.hostname,
          'Content-Length': bodyBytes,
        },
        servername: isHttps ? endpoint.hostname : undefined,
        rejectUnauthorized: isHttps,
      },
      (response) => {
        void readBoundedResponseSnippet(response, 500)
          .then((responseBodySnippet) => {
            resolve({
              statusCode: response.statusCode ?? 0,
              responseBodySnippet,
            })
          })
          .catch(reject)
      }
    )

    const timeoutError = Object.assign(
      new Error(`Webhook request timed out after ${options.timeoutMs}ms.`),
      { name: 'AbortError' }
    )
    const timer = setTimeout(() => {
      req.destroy(timeoutError)
    }, options.timeoutMs)

    req.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    req.on('close', () => clearTimeout(timer))

    req.write(body)
    req.end()
  })
}

async function readBoundedResponseSnippet(
  response: IncomingMessage,
  maxChars: number
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder()
    let out = ''
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      response.resume()
      response.destroy()
      resolve(out ? out.slice(0, maxChars) : undefined)
    }

    response.on('data', (chunk: Buffer) => {
      if (settled) return
      out += decoder.decode(chunk, { stream: true })
      if (out.length >= maxChars) finish()
    })
    response.on('end', finish)
    response.on('error', finish)
  })
}

export { WebhookUrlError }

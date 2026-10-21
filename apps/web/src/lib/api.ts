/**
 * API utilities for making authenticated requests
 *
 * Re-exports the typed Hono RPC client from @durabull/api-client
 * and provides helper utilities for error handling.
 */

import type { InferResponseType } from '@durabull/api-client'
import { type BillingErrorBody, isBillingErrorBody } from '@durabull/api-client/billing'
import { toast } from 'sonner'

export type { ApiType, InferRequestType, InferResponseType } from '@durabull/api-client'
export { api } from '@durabull/api-client'

const API_REQUEST_TIMEOUT_MS = 30_000
export const REDIS_CONNECTION_ERROR_MESSAGE =
  'Unable to connect to Redis for this connection. Verify Redis URL, credentials, TLS settings, and IP allowlist, then retry.'

/**
 * Custom error class for API errors with status code
 * Provides better error handling and type safety
 */
export class ApiError extends Error {
  status: number
  /** Machine-readable error code from the response body, when present. */
  code?: string
  /** Structured billing denial (feature_not_entitled, plan_limit_reached, …). */
  billing?: BillingErrorBody

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.status = status
    this.name = 'ApiError'
    if (body && typeof body === 'object') {
      const code = (body as { code?: unknown }).code
      if (typeof code === 'string') this.code = code
      if (isBillingErrorBody(body)) this.billing = body
    }
  }
}

export const BILLING_DENIED_EVENT = 'durabull:billing-denied'

/**
 * Billing denials are surfaced once by the global upgrade prompt, so every
 * call site gets a consistent explanation of the required plan.
 */
function announceBillingDenial(body: unknown): void {
  if (typeof window === 'undefined' || !isBillingErrorBody(body)) return
  window.dispatchEvent(new CustomEvent<BillingErrorBody>(BILLING_DENIED_EVENT, { detail: body }))
}

/**
 * Extract the 200 response type from a Hono client endpoint
 * Use this to get the success type for an endpoint
 */
export type SuccessResponse<T extends (...args: never[]) => Promise<Response>> = InferResponseType<
  T,
  200
>

/**
 * Helper to handle API response errors and extract JSON
 * Throws ApiError on non-OK responses
 *
 * The generic T should be the expected success response type.
 * Since this throws on error, the returned data is always the success type.
 */
export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `API error: ${res.status}`
    let body: unknown
    try {
      const errorData = (await res.clone().json()) as { error?: string; message?: string }
      body = errorData
      if (errorData.message || errorData.error) {
        message = errorData.message ?? errorData.error ?? message
      }
    } catch {
      // Ignore JSON parse errors
    }

    // Show toast for rate limit errors
    if (res.status === 429) {
      toast.error('Too many requests', {
        description: message || 'Please slow down and try again in a moment.',
      })
    }
    announceBillingDenial(body)

    throw new ApiError(message, res.status, body)
  }
  return res.json() as Promise<T>
}

/**
 * Shorter alias for handleResponse - use in hooks for cleaner code.
 * Handles response, shows toast on 429, throws ApiError on error.
 */
export const handleRes = handleResponse

function isConnectionScopedPath(path: string): boolean {
  return path.includes('/api/c/')
}

async function fetchWithTimeout(path: string, options: RequestInit): Promise<Response> {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), API_REQUEST_TIMEOUT_MS)

  const callerSignal = options.signal
  const abortFromCaller = () => timeoutController.abort()
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeout)
      throw new ApiError('Request was aborted before it started.', 0)
    }
    callerSignal.addEventListener('abort', abortFromCaller, { once: true })
  }

  try {
    return await fetch(path, {
      ...options,
      signal: timeoutController.signal,
    })
  } catch (error) {
    if (timeoutController.signal.aborted && !callerSignal?.aborted) {
      const seconds = Math.floor(API_REQUEST_TIMEOUT_MS / 1000)
      const message = isConnectionScopedPath(path)
        ? `Request timed out after ${seconds}s. ${REDIS_CONNECTION_ERROR_MESSAGE}`
        : `Request timed out after ${seconds}s. The server did not respond in time.`
      throw new ApiError(message, 504)
    }

    if (error instanceof ApiError) {
      throw error
    }

    if (error instanceof Error) {
      throw new ApiError(error.message, 0)
    }

    throw new ApiError('Network request failed', 0)
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

/**
 * Generic fetch function for API requests
 * Used for routes that don't have full RPC type support
 */
export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetchWithTimeout(path, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    let message = `API error: ${res.status}`
    let body: unknown
    try {
      const errorData = await res.json()
      body = errorData
      if (errorData.message || errorData.error) {
        message = errorData.message || errorData.error
      }
    } catch {
      // Ignore JSON parse errors
    }

    // Show toast for rate limit errors
    if (res.status === 429) {
      toast.error('Too many requests', {
        description: message || 'Please slow down and try again in a moment.',
      })
    }
    announceBillingDenial(body)

    throw new ApiError(message, res.status, body)
  }

  return res.json()
}

/**
 * Create a fetch function scoped to a specific Redis connection
 * API calls are made to /api/c/:connectionId/...
 */
export function createConnectionFetchApi(connectionId: string | undefined) {
  return async function connectionFetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    if (!connectionId) {
      throw new ApiError('No connection selected', 400)
    }

    const url = `/api/c/${connectionId}${path}`
    return fetchApi<T>(url, options)
  }
}

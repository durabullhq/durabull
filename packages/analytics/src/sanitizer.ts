import { AnalyticsEvents } from './events'

export const PAGEVIEW_EVENT = '$pageview'

export type TelemetryEventName =
  | (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents]
  | typeof PAGEVIEW_EVENT

type JsonPrimitive = string | number | boolean | null
type SanitizedPropertyValue = JsonPrimitive

export interface SanitizedTelemetryEvent {
  event: string
  properties: Record<string, SanitizedPropertyValue>
  droppedProperties: string[]
}

const KNOWN_DURABULL_EVENTS = new Set<string>([...Object.values(AnalyticsEvents), PAGEVIEW_EVENT])

const FORBIDDEN_PROPERTY_KEYS = new Set([
  '$current_url',
  'connection_id',
  'connectionId',
  'connection_name',
  'connectionName',
  'createdByUserId',
  'email',
  'error_message',
  'image',
  'invitee_email',
  'inviteeEmail',
  'invitation_id',
  'invitationId',
  'job_id',
  'jobId',
  'job_ids',
  'jobIds',
  'logo',
  'member_id',
  'memberId',
  'name',
  'organization_id',
  'organizationId',
  'organization_name',
  'organizationName',
  'organization_slug',
  'organizationSlug',
  'queue_name',
  'queueName',
  'redis_key',
  'redisKey',
  'scheduler_id',
  'schedulerId',
  'search',
  'search_pattern',
  'user_id',
  'userId',
])

const ALLOWED_PROPERTY_KEYS = new Set([
  'action',
  'api_build_id',
  'api_version',
  'app_build_id',
  'app_version',
  'auth_method',
  'authless',
  'client_build_id',
  'client_version',
  'connection_environment',
  'dialog_type',
  'duration_bucket',
  'env_connections',
  'environment',
  'error_category',
  'exclude_bull_keys',
  'filter_status',
  'instance_key',
  'is_default',
  'job_count',
  'job_status',
  'job_tab',
  'keep_most_recent',
  'member_role',
  'new_role',
  'old_role',
  'page',
  'path',
  'persistence',
  'platform_family',
  'provider',
  'queue_count_bucket',
  'queue_status',
  'release_channel',
  'runtime',
  'server_build_id',
  'server_version',
  'stateless',
  'success',
  'tab',
  'theme',
  'update_reason',
  'visible',
  'denial_reason_category',
  'mcp_auth_failure',
  'mcp_client_key',
  'mcp_connection_key',
  'mcp_client_family',
  'mcp_client_version',
  'mcp_principal_key',
  'mcp_protocol_version',
  'mcp_request_key',
  'mcp_transport',
  'http_method',
  'http_status',
  'duration_ms',
  'rpc_error_code',
  'oauth_stage',
  'oauth_grant_type',
  'telemetry_signal',
  'signal_count',
  'mcp_method',
  'mcp_rate_limit_scope',
  'principal_type',
  'response_class',
  'redaction_count',
  'scope_count',
  'tool_name',
])

const PUBLIC_TOP_LEVEL_ROUTES = new Set([
  'auth-error',
  'login',
  'settings',
  'setup-organization',
  'signup',
])

export function isKnownDurabullTelemetryEvent(eventName: string): boolean {
  return KNOWN_DURABULL_EVENTS.has(eventName)
}

function isSanitizedPropertyValue(value: unknown): value is SanitizedPropertyValue {
  if (value === null) return true
  if (typeof value === 'string') return value.length <= 128
  if (typeof value === 'boolean') return true
  return typeof value === 'number' && Number.isFinite(value)
}

function getPathname(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    const url = new URL(value)
    return url.pathname
  } catch {
    return value.startsWith('/') ? value.split('?')[0] : null
  }
}

export function normalizeRoutePath(pathOrUrl: unknown): string | null {
  const pathname = getPathname(pathOrUrl)
  if (!pathname) return null
  if (pathname === '/') return '/'

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return '/'

  if (segments[0] === 'invite') {
    return '/invite/$invitationId'
  }

  if (PUBLIC_TOP_LEVEL_ROUTES.has(segments[0])) {
    return `/${segments[0]}`
  }

  segments[0] = '$orgSlug'

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const next = segments[index + 1]

    if (segment === 'c' && next) {
      segments[index + 1] = '$connectionId'
      index++
      continue
    }

    if (segment === 'queues' && next) {
      segments[index + 1] = '$queueName'
      index++
      continue
    }

    if (segment === 'jobs' && next) {
      segments[index + 1] = '$jobId'
      index++
      continue
    }

    if (segment === 'alerts' && next && next !== 'new') {
      segments[index + 1] = '$ruleId'
      index++
    }
  }

  return `/${segments.join('/')}`
}

export function categorizeErrorMessage(message: unknown): string {
  if (typeof message !== 'string') return 'unknown'

  const normalized = message.toLowerCase()
  if (normalized.includes('redis')) return 'redis'
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'timeout'
  if (normalized.includes('network') || normalized.includes('fetch')) return 'network'
  if (normalized.includes('auth') || normalized.includes('permission')) return 'auth'
  if (normalized.includes('rate limit') || normalized.includes('too many')) return 'rate_limit'
  if (normalized.includes('valid') || normalized.includes('required')) return 'validation'
  return 'unknown'
}

export function sanitizeTelemetryEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): SanitizedTelemetryEvent {
  const sanitized: Record<string, SanitizedPropertyValue> = {}
  const droppedProperties: string[] = []

  if (eventName === PAGEVIEW_EVENT) {
    const routePath = normalizeRoutePath(properties.path ?? properties.$current_url)
    if (routePath) {
      sanitized.path = routePath
    }
  }

  if (properties.error_message !== undefined) {
    sanitized.error_category = categorizeErrorMessage(properties.error_message)
    droppedProperties.push('error_message')
  }

  for (const [key, value] of Object.entries(properties)) {
    if (key === 'path' && eventName === PAGEVIEW_EVENT) continue
    if (key === 'path') {
      droppedProperties.push(key)
      continue
    }
    if (key === 'error_message') continue

    if (FORBIDDEN_PROPERTY_KEYS.has(key) || !ALLOWED_PROPERTY_KEYS.has(key)) {
      droppedProperties.push(key)
      continue
    }

    if (value === undefined) {
      continue
    }

    if (!isSanitizedPropertyValue(value)) {
      droppedProperties.push(key)
      continue
    }

    sanitized[key] = value
  }

  return {
    event: eventName,
    properties: sanitized,
    droppedProperties,
  }
}

export function getForbiddenTelemetryPropertyKeys(): string[] {
  return [...FORBIDDEN_PROPERTY_KEYS].sort()
}

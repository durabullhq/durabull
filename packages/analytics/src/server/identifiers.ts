import { createHmac } from 'node:crypto'

export function hashTelemetryIdentifier(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function hashMcpAnalyticsSessionId(principalId: string, secret: string): string {
  return createHmac('sha256', secret).update(`mcp:${principalId}`).digest('hex').slice(0, 32)
}

export function hashIdentifiedUserDistinctId(userId: string, secret: string): string {
  return hashTelemetryIdentifier(`user:${userId}`, secret)
}

export function hashIdentifiedOrganizationDistinctId(
  organizationId: string,
  secret: string
): string {
  return hashTelemetryIdentifier(`org:${organizationId}`, secret)
}

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { env } from '@durabull/env'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
])

export interface ResolvedWebhookEndpoint {
  hostname: string
  port: number
  protocol: 'http:' | 'https:'
  path: string
  pinnedAddress: string
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    if (isIP(mapped) === 4) {
      return isPrivateIpv4(mapped.split('.').map(Number))
    }
  }
  return false
}

function isPrivateIpAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    return isPrivateIpv4(address.split('.').map(Number))
  }
  if (version === 6) {
    return isPrivateIpv6(address)
  }
  return true
}

function isHttpAllowed(): boolean {
  return env.DURABULL_WEBHOOK_ALLOW_HTTP === true || env.NODE_ENV === 'development'
}

function assertAllowedProtocol(parsed: URL): void {
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isHttpAllowed())) {
    throw new WebhookUrlError('Webhook URL must use HTTPS.')
  }
}

function assertAllowedHostname(hostname: string): void {
  const normalized = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost')) {
    throw new WebhookUrlError('Webhook URL hostname is not allowed.')
  }
}

function assertAllowedAddresses(addresses: string[]): string {
  if (addresses.length === 0) {
    throw new WebhookUrlError('Webhook URL hostname could not be resolved.')
  }

  for (const address of addresses) {
    if (isPrivateIpAddress(address)) {
      throw new WebhookUrlError('Webhook URL must not target private or local IP addresses.')
    }
  }

  return addresses[0]!
}

export function normalizeWebhookUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  parsed.hash = ''
  return parsed.toString()
}

export function getWebhookDeliveryTarget(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  parsed.hash = ''
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}

export async function resolveAllowedWebhookEndpoint(
  rawUrl: string
): Promise<ResolvedWebhookEndpoint> {
  let parsed: URL
  try {
    parsed = new URL(normalizeWebhookUrl(rawUrl))
  } catch {
    throw new WebhookUrlError('Webhook URL must be a valid URL.')
  }

  assertAllowedProtocol(parsed)

  if (parsed.username || parsed.password) {
    throw new WebhookUrlError('Webhook URL must not include credentials.')
  }

  const hostname = parsed.hostname.toLowerCase()
  assertAllowedHostname(hostname)

  const port = parsed.port !== '' ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
  const path = `${parsed.pathname}${parsed.search}`

  const directIpVersion = isIP(hostname)
  if (directIpVersion !== 0) {
    if (isPrivateIpAddress(hostname)) {
      throw new WebhookUrlError('Webhook URL must not target private or local IP addresses.')
    }
    return {
      hostname,
      port,
      protocol: parsed.protocol as 'http:' | 'https:',
      path,
      pinnedAddress: hostname,
    }
  }

  let addresses: string[]
  try {
    const result = await lookup(hostname, { all: true, verbatim: true })
    addresses = result.map((entry) => entry.address)
  } catch {
    throw new WebhookUrlError('Webhook URL hostname could not be resolved.')
  }

  const pinnedAddress = assertAllowedAddresses(addresses)

  return {
    hostname,
    port,
    protocol: parsed.protocol as 'http:' | 'https:',
    path,
    pinnedAddress,
  }
}

export async function assertAllowedWebhookUrl(rawUrl: string): Promise<void> {
  await resolveAllowedWebhookEndpoint(rawUrl)
}

export class WebhookUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookUrlError'
  }
}

import { parseHostHeader } from './parse-host'

const DEV_HOST_ENTRIES = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  'localhost:3000',
  'localhost:3001',
  '127.0.0.1:3000',
] as const

export interface GetDefaultAllowedHostsOptions {
  appBaseUrl: string
  /** Include localhost / loopback entries (default: true outside production). */
  includeDevHosts?: boolean
  /**
   * When true, a request with no port matches a bare hostname entry.
   * When false, only exact `host` or `hostname:port` entries match (stricter).
   */
  allowHostnameWithoutPort?: boolean
}

function addHostFromUrl(hosts: Set<string>, rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.host) {
      hosts.add(parsed.host.toLowerCase())
    }
    if (!parsed.port && parsed.hostname) {
      const hostname = parsed.hostname.toLowerCase()
      hosts.add(hostname)
      if (parsed.protocol === 'https:') hosts.add(`${hostname}:443`)
      if (parsed.protocol === 'http:') hosts.add(`${hostname}:80`)
    }
  } catch {
    // Caller should pass a valid app base URL.
  }
}

export function getDefaultAllowedHosts(
  options: GetDefaultAllowedHostsOptions
): ReadonlySet<string> {
  const { appBaseUrl, includeDevHosts = true } = options

  const hosts = new Set<string>()

  if (includeDevHosts) {
    for (const entry of DEV_HOST_ENTRIES) {
      hosts.add(entry)
    }
  }

  addHostFromUrl(hosts, appBaseUrl)

  return hosts
}

export interface IsAllowedHostOptions {
  allowHostnameWithoutPort?: boolean
}

/**
 * Returns whether `hostHeader` matches the allowlist.
 * Rejects malformed hosts (including `localhost:3000.evil`).
 */
export function isAllowedHost(
  hostHeader: string | undefined,
  allowedHosts: ReadonlySet<string>,
  options: IsAllowedHostOptions = {}
): boolean {
  if (!hostHeader?.trim()) return false

  const parsed = parseHostHeader(hostHeader)
  if (!parsed) return false

  if (allowedHosts.has(parsed.host)) return true

  if (parsed.port === undefined && options.allowHostnameWithoutPort !== false) {
    return allowedHosts.has(parsed.hostname)
  }

  return false
}

export function getProductionAllowedHosts(appBaseUrl: string): ReadonlySet<string> {
  return getDefaultAllowedHosts({
    appBaseUrl,
    includeDevHosts: false,
    allowHostnameWithoutPort: false,
  })
}

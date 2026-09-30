import { describe, expect, it } from 'bun:test'

import { getDefaultAllowedHosts, getProductionAllowedHosts, isAllowedHost } from './allowed-hosts'

describe('allowed hosts', () => {
  it('includes dev hosts and APP_BASE_URL host', () => {
    const hosts = getDefaultAllowedHosts({
      appBaseUrl: 'https://app.durabull.io',
      includeDevHosts: true,
    })

    expect(hosts.has('localhost')).toBe(true)
    expect(hosts.has('127.0.0.1')).toBe(true)
    expect(hosts.has('app.durabull.io')).toBe(true)
  })

  it('rejects fake port suffix in host header', () => {
    const hosts = getDefaultAllowedHosts({
      appBaseUrl: 'http://localhost:3000',
      includeDevHosts: true,
    })

    expect(isAllowedHost('localhost:3000', hosts)).toBe(true)
    expect(isAllowedHost('localhost:3000.evil', hosts)).toBe(false)
    expect(isAllowedHost('evil.example.com', hosts)).toBe(false)
  })

  it('adds default-port host variants for https and http base URLs', () => {
    const httpsHosts = getProductionAllowedHosts('https://app.durabull.io')
    expect(httpsHosts.has('app.durabull.io:443')).toBe(true)

    const httpHosts = getProductionAllowedHosts('http://app.durabull.io')
    expect(httpHosts.has('app.durabull.io:80')).toBe(true)
  })

  it('production allowlist omits dev hosts and requires exact host match', () => {
    const hosts = getProductionAllowedHosts('https://app.durabull.io')

    expect(hosts.has('localhost')).toBe(false)
    expect(isAllowedHost('app.durabull.io', hosts, { allowHostnameWithoutPort: false })).toBe(true)
    expect(isAllowedHost('app.durabull.io:443', hosts, { allowHostnameWithoutPort: false })).toBe(
      true
    )
  })

  it('rejects missing host header', () => {
    const hosts = getDefaultAllowedHosts({ appBaseUrl: 'http://localhost:3000' })
    expect(isAllowedHost(undefined, hosts)).toBe(false)
  })
})

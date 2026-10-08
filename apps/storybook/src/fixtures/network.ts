import { delay, HttpResponse, http } from 'msw'
import { setupWorker } from 'msw/browser'
import { metrics, redisHealth } from './analytics'
import {
  connections,
  counts,
  destinations,
  discovery,
  event,
  job,
  jobs,
  members,
  organizationFixture,
  queues,
  rule,
  scheduler,
  user,
  workers,
} from './data'

export type FixtureState = 'ready' | 'empty' | 'empty-connections' | 'loading' | 'error'
let state: FixtureState = 'ready'
let updateAvailable = false
export function setUpdateAvailable(value: boolean) {
  updateAvailable = value
}
export function setFixtureState(next: FixtureState) {
  state = next
}
export const appConfig = {
  authless: false,
  envConnections: false,
  persistence: 'postgres',
  stateless: false,
  environment: 'storybook',
  posthog: { enabled: false, key: null, host: '/ingest', uiHost: '' },
  telemetry: {
    enabled: false,
    collectionRequired: false,
    dedupeIdentifiedPosthogEvents: false,
    disclosureUrl: 'https://durabull.io/privacy',
  },
  version: {
    version: 'storybook',
    buildId: 'public-preview',
    buildTime: null,
    releaseChannel: 'development',
    update: { required: false, reason: 'up_to_date' },
  },
}
function readFixture(path: string, url: URL): unknown {
  const list = <T>(items: T[]) => (state === 'empty' ? [] : items)
  if (path === '/app/config' || path === '/app/version')
    return path.endsWith('version')
      ? {
          ...appConfig.version,
          update: {
            required: updateAvailable,
            reason: updateAvailable ? 'build_mismatch' : 'up_to_date',
          },
        }
      : appConfig
  if (path.startsWith('/mcp/oauth-consent/'))
    return {
      clientId: 'demo-assistant',
      name: 'Demo assistant',
      icon: null,
      disabled: false,
      scopes: ['openid', 'mcp:jobs:read', 'mcp:jobs:retry'],
    }
  if (path === '/session')
    return {
      user,
      organization: organizationFixture,
      session: { activeOrganizationId: 'demo-org' },
    }
  if (path === '/connections')
    return { connections: state === 'empty-connections' ? [] : connections }
  if (path.startsWith('/connections/')) return { connection: connections[0], ...connections[0] }
  if (path === '/team/members') return { members: list(members) }
  if (path.startsWith('/invitations/'))
    return {
      invitation: {
        id: 'demo-invite',
        email: 'alex@example.com',
        role: 'member',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00Z',
      },
      organization: organizationFixture,
      inviter: user,
    }
  if (path.endsWith('/alerts/summary'))
    return {
      connections: connections.map((c) => ({
        ...c,
        connectionId: c.id,
        connectionName: c.name,
        openCount: 1,
        firingCount: 1,
        acknowledgedCount: 0,
        open: 1,
        firing: 1,
        acknowledged: 0,
      })),
      totals: { open: 2, firing: 2, acknowledged: 0 },
      openCount: 2,
      firingCount: 2,
      acknowledgedCount: 0,
    }
  if (path.endsWith('/alerts/destinations')) return { destinations: list(destinations) }
  if (path.includes('/integrations/linear'))
    return { integration: null, teams: [], projects: [], states: [], priorities: [] }
  if (path.endsWith('/alerts/events'))
    return { events: list([event]), total: state === 'empty' ? 0 : 1, hasMore: false }
  if (path.endsWith('/alerts/rules')) return { rules: list([rule]) }
  if (path.includes('/alerts/rules/')) return { rule }
  if (path.endsWith('/discovery')) return discovery
  if (path.endsWith('/can-delete'))
    return { canDelete: true, reason: null, jobCounts: counts, workers: [], totalJobs: 0 }
  if (path.endsWith('/stacktraces'))
    return {
      items: [{ attemptNumber: 3, stacktrace: job.stacktrace[0], isLatest: true }],
      total: 1,
      count: 1,
      page: 1,
      totalPages: 1,
      hasMore: false,
    }
  if (path.endsWith('/logs') || path.endsWith('/logs/tail'))
    return {
      logs: ['Preparing receipt for order-1042', 'Demo email provider returned HTTP 503'],
      count: 2,
      total: 2,
      start: 0,
      end: 2,
      hasMore: false,
    }
  if (/\/jobs\/[^/]+$/.test(path)) return job
  if (path.endsWith('/jobs')) {
    const filtered = list(jobs).filter(
      (j) => !url.searchParams.get('status') || j.status === url.searchParams.get('status')
    )
    return { jobs: filtered, total: filtered.length, hasMore: false, nextCursor: null }
  }
  if (path.includes('/scheduled-jobs')) {
    if (/\/queue\/[^/]+\/[^/]+$/.test(path)) return { scheduler }
    return { scheduledJobs: list([scheduler]), total: 1 }
  }
  if (path.endsWith('/workers'))
    return {
      workers: list(workers),
      queues: list(queues),
      totalWorkers: state === 'empty' ? 0 : workers.length,
      totalQueues: state === 'empty' ? 0 : queues.length,
    }
  if (path.endsWith('/redis-keys/search'))
    return {
      keys: list([
        {
          key: 'bull:email:receipts:meta',
          name: 'bull:email:receipts:meta',
          type: 'hash',
          ttl: -1,
          memoryUsage: 256,
        },
      ]),
      cursor: '0',
      nextCursor: '0',
      hasMore: false,
      total: 1,
    }
  if (path.includes('/redis-keys/value/'))
    return { key: 'bull:email:receipts:meta', type: 'hash', ttl: -1, value: { version: '5.0.0' } }
  if (path.includes('/redis-health'))
    return state === 'empty'
      ? {
          ...redisHealth,
          latest: null,
          series: [],
          range: { ...redisHealth.range, sampledBuckets: 0, coveragePercent: 0 },
        }
      : redisHealth
  if (path.endsWith('/metrics') && path.includes('/queues/')) return metrics
  if (path.endsWith('/metrics'))
    return {
      metrics: list([metrics]),
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      hasMore: false,
    }
  if (path.endsWith('/queues')) {
    const filtered = list(queues).filter(
      (q) =>
        q.name.includes(url.searchParams.get('search') ?? '') &&
        (!url.searchParams.get('status') || q.status === url.searchParams.get('status'))
    )
    return {
      queues: filtered,
      total: filtered.length,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      totalJobCounts:
        state === 'empty' ? Object.fromEntries(Object.keys(counts).map((key) => [key, 0])) : counts,
      discovery,
    }
  }
  if (/\/queues\/[^/]+$/.test(path)) return { ...queues[0], workers, scheduledJobsCount: 1 }
  throw new Error(`Missing Storybook fixture: ${path}`)
}
export const worker = setupWorker(
  http.all('*/api/*', async ({ request }) => {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname.slice(4))
    const infrastructure = [
      '/app/config',
      '/app/version',
      '/session',
      '/connections',
      '/team/members',
    ].includes(path)
    if (!infrastructure && state === 'loading') await delay(60_000)
    if (!infrastructure && state === 'error')
      return HttpResponse.json(
        { error: 'Demo connection unavailable. Try again.' },
        { status: 503 }
      )
    if (request.method !== 'GET')
      return HttpResponse.json({
        success: true,
        message: 'Simulated in Storybook',
        rule,
        event,
        destination: destinations[0],
        connection: connections[0],
        scheduler,
        jobId: 'demo-new-job',
        queueName: 'email:receipts',
        jobName: 'send-receipt',
        removed: 1,
        totalRemoved: 1,
        failed: 0,
      })
    try {
      return HttpResponse.json(readFixture(path, url) as Record<string, unknown>)
    } catch (error) {
      console.error(error)
      return HttpResponse.json({ error: String(error) }, { status: 501 })
    }
  })
)
let started: Promise<unknown> | undefined
export function startFixtures() {
  // Relative URL keeps the catalog deployable beneath any public path.
  started ??= worker.start({
    quiet: true,
    serviceWorker: { url: new URL('mockServiceWorker.js', document.baseURI).href },
    onUnhandledRequest(request) {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/ingest') || url.origin !== location.origin)
        throw new Error(`Public Storybook blocked unexpected request: ${url.origin}${url.pathname}`)
    },
  })
  return started
}

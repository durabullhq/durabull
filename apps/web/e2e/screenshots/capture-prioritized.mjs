// Standalone screenshot capture for issue #116 (prioritized jobs on Queues page).
//
// Why standalone instead of the full e2e harness: in this workspace port 3001 is
// permanently owned by an unrelated project, so the web proxy cannot reach the
// durabull API. We instead render the REAL web UI (Vite on 4319) in authless mode
// and intercept /api/** with deterministic fixtures so the screenshots reflect the
// actual components and styling shipped in this change.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PW_BASE_URL ?? 'http://127.0.0.1:4319'
const ORG_SLUG = 'acme'
const CONNECTION_ID = 'conn-1'
const now = Date.now()

const queues = [
  { name: 'payment-processing', waiting: 142, prioritized: 18, active: 6, delayed: 3, completed: 48210, failed: 12, paused: 0 },
  { name: 'webhook-delivery', waiting: 27, prioritized: 9, active: 1, delayed: 4, completed: 5402, failed: 7, paused: 0 },
  { name: 'email-dispatch', waiting: 38, prioritized: 5, active: 2, delayed: 0, completed: 12903, failed: 1, paused: 0 },
  { name: 'image-resize', waiting: 0, prioritized: 0, active: 0, delayed: 0, completed: 7301, failed: 0, paused: 0 },
]

const totalJobCounts = queues.reduce(
  (acc, q) => ({
    waiting: acc.waiting + q.waiting,
    active: acc.active + q.active,
    delayed: acc.delayed + q.delayed,
    completed: acc.completed + q.completed,
    failed: acc.failed + q.failed,
    prioritized: acc.prioritized + q.prioritized,
  }),
  { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, prioritized: 0 }
)

const discovery = {
  running: false,
  startedAt: now - 60_000,
  completedAt: now - 30_000,
  lastError: null,
  indexed: { total: queues.length, confirmed: queues.length, pending: 0, lastDiscoveredAt: now - 30_000 },
}

const queuesResponse = {
  queues: queues.map((q) => ({
    name: q.name,
    status: 'active',
    isPaused: false,
    discoveryState: 'confirmed',
    jobCounts: {
      waiting: q.waiting,
      active: q.active,
      delayed: q.delayed,
      completed: q.completed,
      failed: q.failed,
      paused: q.paused,
      prioritized: q.prioritized,
    },
  })),
  total: queues.length,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  hasMore: false,
  totalJobCounts,
  discovery,
}

const appConfig = {
  authless: true,
  envConnections: false,
  persistence: 'postgres',
  stateless: false,
  environment: 'development',
  posthog: { enabled: false, key: null, host: '/ingest', uiHost: 'https://us.posthog.com' },
  telemetry: { enabled: false, collectionRequired: false, dedupeIdentifiedPosthogEvents: false, disclosureUrl: 'https://durabull.io/privacy' },
  version: { version: 'dev', buildId: 'dev', buildTime: new Date(now).toISOString(), releaseChannel: 'development', update: { required: false, reason: 'up_to_date' } },
}

const sessionResponse = {
  user: null,
  session: null,
  organization: { id: 'org-1', name: 'Acme Corporation', slug: ORG_SLUG, logo: null },
}

const connectionsResponse = {
  connections: [
    {
      id: CONNECTION_ID,
      name: 'Acme Production',
      isDefault: true,
      environment: 'production',
      createdAt: new Date(now - 86_400_000).toISOString(),
      updatedAt: new Date(now - 3_600_000).toISOString(),
    },
  ],
}

function json(body) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  })
  const page = await context.newPage()

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    if (p.endsWith('/api/app/config')) return route.fulfill(json(appConfig))
    if (p.endsWith('/api/session')) return route.fulfill(json(sessionResponse))
    if (p.includes('/api/auth/get-session')) return route.fulfill(json(null))
    if (p.endsWith('/api/connections')) return route.fulfill(json(connectionsResponse))
    if (p.includes(`/queues/discovery`)) return route.fulfill(json(discovery))
    if (p.includes(`/c/${CONNECTION_ID}/queues`)) return route.fulfill(json(queuesResponse))
    // Don't hijack module/asset requests that merely contain "api" in their path.
    if (/\.(m?[jt]sx?|css|wasm|map|svg|png|ico|woff2?)$/.test(p) || p.includes('/@') || p.includes('/src/') || p.includes('node_modules')) {
      return route.continue()
    }
    console.log('[mock:fallthrough]', p)
    // Sensible empty defaults for anything else the shell requests.
    return route.fulfill(json({}))
  })

  const targetUrl = `${BASE}/${ORG_SLUG}/c/${CONNECTION_ID}/`
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

  // Wait for the real UI to render the prioritized affordances.
  await page.getByText('Prioritized', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 })
  await page.getByRole('columnheader', { name: 'Prioritized' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(600)

  await page.screenshot({ path: path.join(__dirname, 'queues-overview-prioritized.png'), fullPage: true })
  const cards = page.locator('div.grid').filter({ hasText: 'Prioritized' }).filter({ hasText: 'Completed' }).first()
  await cards.screenshot({ path: path.join(__dirname, 'queues-summary-cards-prioritized.png') })

  console.log('Screenshots captured:')
  console.log(' - queues-overview-prioritized.png')
  console.log(' - queues-summary-cards-prioritized.png')

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

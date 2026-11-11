import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/test'

type AppConfigResponse = {
  authless: boolean
  envConnections: boolean
  persistence: 'postgres' | 'pglite' | 'unknown'
  stateless: boolean
  environment: 'development' | 'test' | 'production'
  posthog: {
    enabled: boolean
    key: string | null
    host: string
    uiHost: string
  }
}

type SessionResponse = {
  organization?: {
    id: string
    slug: string
    name: string
  } | null
}

type ConnectionsResponse = {
  connections: Array<{
    id: string
    name: string
    isDefault: boolean
    environment: 'development' | 'staging' | 'production' | null
  }>
}

async function getAuthlessRuntimeContext(page: Page) {
  const sessionRes = await page.request.get('/api/session')
  expect(sessionRes.ok()).toBeTruthy()
  const session = (await sessionRes.json()) as SessionResponse
  expect(session.organization?.slug).toBeTruthy()

  const connectionsRes = await page.request.get('/api/connections')
  expect(connectionsRes.ok()).toBeTruthy()
  const { connections } = (await connectionsRes.json()) as ConnectionsResponse
  expect(connections.length).toBeGreaterThan(0)

  return {
    orgSlug: session.organization?.slug as string,
    firstConnection: connections[0],
  }
}

test.describe('Authless Mode', () => {
  test('app config endpoint reports authless env-connections setup', async ({ page }) => {
    const configRes = await page.request.get('/api/app/config')
    expect(configRes.ok()).toBeTruthy()

    const config = (await configRes.json()) as AppConfigResponse
    expect(config.authless).toBe(true)
    expect(config.envConnections).toBe(true)
    expect(config.persistence).toBe('pglite')
    expect(config.stateless).toBe(true)
    expect(['development', 'test', 'production']).toContain(config.environment)
  })

  test('app boots without login and keeps connection management read-only', async ({ page }) => {
    const { orgSlug, firstConnection } = await getAuthlessRuntimeContext(page)

    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto(`/${orgSlug}/connections`)
    await expect(
      page.getByRole('heading', { name: 'Connections', exact: true, level: 1 })
    ).toBeVisible()
    // Connections are rows of one table; each row keeps the `connection-card-<id>` test id.
    await expect(page.getByTestId(`connection-card-${firstConnection.id}`)).toContainText(
      firstConnection.name
    )

    await expect(page.getByTestId('add-connection-button')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
  })

  test('core queue pages load in authless mode', async ({ page }) => {
    const { orgSlug, firstConnection } = await getAuthlessRuntimeContext(page)

    await page.goto(`/${orgSlug}/c/${firstConnection.id}`)
    await expect(page.getByRole('heading', { name: 'Queues', exact: true, level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Workers' }).click()
    await expect(
      page.getByRole('heading', { name: 'Workers', exact: true, level: 1 })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Scheduled Jobs' }).click()
    await expect(
      page.getByRole('heading', { name: 'Scheduled Jobs', exact: true, level: 1 })
    ).toBeVisible()

    await page.getByRole('link', { name: 'KV Explorer' }).click()
    await expect(
      page.getByRole('heading', { name: 'KV Explorer', exact: true, level: 1 })
    ).toBeVisible()
  })
})

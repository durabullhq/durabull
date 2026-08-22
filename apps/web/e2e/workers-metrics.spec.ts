import {
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getTestQueueName,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

test.describe('Workers and observability', () => {
  test('workers page renders stat cards and topology or empty state', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/workers`)
    await expect(
      page.getByRole('heading', { name: 'Workers', exact: true, level: 1 })
    ).toBeVisible()

    // Stat cards render once loading completes.
    await expect(page.getByText('Worker Topology')).toBeVisible({ timeout: 15000 })

    // Either the empty state (no live workers) or the topology canvas renders.
    const emptyState = page.getByText('No Workers Connected')
    const topology = page.getByText('Loading worker topology...')
    await expect(emptyState.or(topology).or(page.locator('.react-flow').first())).toBeVisible({
      timeout: 15000,
    })
  })

  test('queue observability section shows telemetry, window switcher, and prometheus toggle', async ({
    page,
  }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)

    await page.goto(
      `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${encodeURIComponent(queueName)}?section=observability`
    )

    await expect(
      page.getByRole('heading', { name: queueName, exact: true, level: 1 })
    ).toBeVisible()
    await expect(page.getByText('BullMQ Native Telemetry')).toBeVisible({ timeout: 15000 })

    // Window buttons exist for every supported range.
    for (const label of ['1H', '6H', '24H', '7D']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    // Prometheus badge reflects the off state initially.
    await expect(page.getByText('Prometheus: Off')).toBeVisible()

    // Toggling Prometheus flips the badge text.
    await page.getByRole('button', { name: 'Prometheus' }).first().click()
    await expect(page.getByText('Prometheus: Included')).toBeVisible({ timeout: 15000 })

    // The export section appears with a copy affordance.
    await expect(page.getByText('Prometheus Export')).toBeVisible()

    // Switching windows updates the active button styling.
    await page.getByRole('button', { name: '24H', exact: true }).click()
    await expect(page.getByText('Finished (window)')).toBeVisible({ timeout: 15000 })
  })

  test('metrics endpoint returns structured data for the test queue', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)

    const response = await page.request.get(
      `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/metrics?windowMinutes=60`
    )
    expect(response.ok()).toBeTruthy()

    const data = (await response.json()) as {
      queueName?: string
      series?: { totals?: Record<string, number> }
      counts?: Record<string, number>
      warnings?: unknown[]
    }
    expect(data.queueName).toBe(queueName)
    expect(data.series?.totals).toBeTruthy()
    expect(typeof data.series?.totals?.finishedInWindow).toBe('number')
    expect(typeof data.counts).toBe('object')
    expect(Array.isArray(data.warnings)).toBe(true)
  })
})

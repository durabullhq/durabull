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

    // The topology panel offers a graph and a list of the same workers.
    await expect(page.getByRole('button', { name: 'Graph', exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByRole('button', { name: 'List', exact: true })).toBeVisible()

    // Either the empty state (no live workers) or the topology canvas renders.
    const emptyState = page.getByText('No Workers Connected')
    const topology = page.getByText('Loading worker topology…')
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
    await expect(page.getByRole('heading', { name: 'Throughput', exact: true })).toBeVisible({
      timeout: 15000,
    })

    // Window buttons exist for every supported range.
    for (const label of ['1H', '6H', '24H', '7D']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }

    // The Prometheus export starts excluded; toggling it includes the payload.
    await expect(page.getByRole('heading', { name: 'Prometheus export' })).toBeVisible()
    const includeToggle = page.getByRole('button', { name: 'Include', exact: true })
    await expect(includeToggle).toHaveAttribute('aria-pressed', 'false')
    await includeToggle.click()
    await expect(page.getByRole('button', { name: 'Included', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 15000 }
    )

    // Switching windows updates the active button styling.
    await page.getByRole('button', { name: '24H', exact: true }).click()
    await expect(page.getByText('Finished · 24H')).toBeVisible({ timeout: 15000 })
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

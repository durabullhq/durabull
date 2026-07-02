import type { APIResponse, Page } from '@playwright/test'
import { expect, test } from './fixtures/test'

/**
 * E2E coverage for the alerts product (incidents-first IA, sentence builder,
 * snooze, destinations). Runs only in authless mode — gated via testIgnore in
 * playwright.config.ts, same as authless.spec.ts.
 */

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
  }>
}

type AlertRuleRecord = {
  id: string
  name: string
  state: 'active' | 'snoozed' | 'disabled'
  mutedUntil: string | null
}

type AlertDestinationRecord = {
  id: string
  name: string
  type: 'webhook' | 'email' | 'linear'
}

async function apiJson<T>(response: APIResponse, context: string): Promise<T> {
  if (response.ok()) {
    return (await response.json()) as T
  }

  let body = ''
  try {
    body = await response.text()
  } catch {
    body = '<unable to read body>'
  }
  throw new Error(`${context} failed with ${response.status()}: ${body.slice(0, 500)}`)
}

async function getAuthlessRuntimeContext(page: Page) {
  const session = await apiJson<SessionResponse>(
    await page.request.get('/api/session'),
    'GET /api/session'
  )
  expect(session.organization?.slug).toBeTruthy()

  const { connections } = await apiJson<ConnectionsResponse>(
    await page.request.get('/api/connections'),
    'GET /api/connections'
  )
  expect(connections.length).toBeGreaterThan(0)

  return {
    orgSlug: session.organization?.slug as string,
    connectionId: connections[0].id,
  }
}

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** Minimal failure-spike rule scoped to all queues (exclude mode, no selections). */
async function createRuleViaApi(
  page: Page,
  connectionId: string,
  name: string
): Promise<AlertRuleRecord> {
  const response = await page.request.post(`/api/c/${connectionId}/alerts/rules`, {
    data: {
      name,
      type: 'failure_threshold',
      queueName: null,
      queueFilterMode: 'exclude',
      filterQueueNames: [],
      config: { count: 25, windowMinutes: 5 },
      notificationChannels: [],
      cooldownMinutes: 30,
      enabled: true,
    },
  })
  const data = await apiJson<{ rule: AlertRuleRecord }>(
    response,
    `POST /api/c/${connectionId}/alerts/rules`
  )
  return data.rule
}

async function listRulesViaApi(page: Page, connectionId: string): Promise<AlertRuleRecord[]> {
  const data = await apiJson<{ rules: AlertRuleRecord[] }>(
    await page.request.get(`/api/c/${connectionId}/alerts/rules`),
    `GET /api/c/${connectionId}/alerts/rules`
  )
  return data.rules ?? []
}

async function deleteRuleViaApi(page: Page, connectionId: string, ruleId: string): Promise<void> {
  await apiJson(
    await page.request.delete(`/api/c/${connectionId}/alerts/rules/${ruleId}`),
    `DELETE /api/c/${connectionId}/alerts/rules/${ruleId}`
  )
}

async function deleteAllRulesViaApi(page: Page, connectionId: string): Promise<void> {
  for (const rule of await listRulesViaApi(page, connectionId)) {
    await deleteRuleViaApi(page, connectionId, rule.id)
  }
}

async function listDestinationsViaApi(page: Page): Promise<AlertDestinationRecord[]> {
  const data = await apiJson<{ destinations: AlertDestinationRecord[] }>(
    await page.request.get('/api/alerts/destinations'),
    'GET /api/alerts/destinations'
  )
  return data.destinations ?? []
}

async function deleteDestinationViaApi(page: Page, destinationId: string): Promise<void> {
  await apiJson(
    await page.request.delete(`/api/alerts/destinations/${destinationId}`),
    `DELETE /api/alerts/destinations/${destinationId}`
  )
}

test.describe('Alerts', () => {
  test('sidebar Alerts link lands on the Incidents view and the switcher navigates to Rules', async ({
    page,
  }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)

    await page.goto(`/${orgSlug}/c/${connectionId}`)
    await expect(page.getByRole('heading', { name: 'Queues', exact: true, level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Alerts' }).click()

    // Landing view is Incidents, not Rules: status filter + metric cards.
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/c/${connectionId}/alerts/?(\\?.*)?$`))
    await expect(page.getByLabel('Filter incidents by status')).toBeVisible()
    await expect(page.getByText('Resolved · 24h')).toBeVisible()

    const viewSwitcher = page.getByRole('navigation', { name: 'Alerts views' })
    await viewSwitcher.getByRole('link', { name: 'Rules' }).click()
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/c/${connectionId}/alerts/rules/?$`))

    await viewSwitcher.getByRole('link', { name: 'Incidents' }).click()
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/c/${connectionId}/alerts/?(\\?.*)?$`))
    await expect(page.getByLabel('Filter incidents by status')).toBeVisible()
  })

  test('rules empty state shows template cards and Failure spike preloads the builder sentence', async ({
    page,
  }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)
    await deleteAllRulesViaApi(page, connectionId)

    await page.goto(`/${orgSlug}/c/${connectionId}/alerts/rules`)
    await expect(page.getByText('Start with a template')).toBeVisible()
    await expect(page.getByTestId('rule-template-error-rate')).toBeVisible()
    await expect(page.getByTestId('rule-template-scratch')).toBeVisible()

    await page.getByTestId('rule-template-failure-spike').click()
    await expect(page).toHaveURL(/\/alerts\/new\?template=failure-spike$/)

    // Template preloads the sentence: threshold 25 within 5 minutes.
    const conditionToken = page.getByTestId('sentence-token-condition')
    await expect(conditionToken).toHaveText('≥ 25 new failures within 5 min')

    // Changing the count field updates the sentence live.
    await page.getByLabel('New failures').fill('40')
    await expect(conditionToken).toHaveText('≥ 40 new failures within 5 min')
  })

  test('inline validation shows field errors on submit and blocks navigation', async ({ page }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)

    await page.goto(`/${orgSlug}/c/${connectionId}/alerts/new?template=failure-spike`)
    await expect(page.getByTestId('alert-rule-sentence')).toBeVisible()

    // Invalid count + missing name.
    await page.getByLabel('New failures').fill('0')
    const rulesBefore = await listRulesViaApi(page, connectionId)

    await page.getByRole('button', { name: 'Create rule' }).click()

    await expect(page.getByTestId('alert-rule-form-error')).toHaveText(
      'Fix the highlighted fields before saving.'
    )
    await expect(page.getByText('Rule name is required.')).toBeVisible()
    await expect(
      page.getByText('Failure threshold count must be a whole number between 1 and 10000.')
    ).toBeVisible()

    // Still on the builder; no rule was created.
    await expect(page).toHaveURL(/\/alerts\/new\?template=failure-spike$/)
    const rulesAfter = await listRulesViaApi(page, connectionId)
    expect(rulesAfter.length).toBe(rulesBefore.length)
  })

  test('creates a rule from the Failure spike template and lists it in the rules table', async ({
    page,
  }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)
    const ruleName = uniqueName('Spike alert')

    await page.goto(`/${orgSlug}/c/${connectionId}/alerts/new?template=failure-spike`)
    // Exclude-mode "all queues" template needs no queue selections to save.
    await expect(page.getByTestId('sentence-token-queues')).toHaveText('all queues')

    await page.getByTestId('alert-rule-name-input').fill(ruleName)
    await page.getByRole('button', { name: 'Create rule' }).click()

    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/c/${connectionId}/alerts/rules/?$`))
    const row = page.getByTestId('alert-rule-row').filter({ hasText: ruleName })
    await expect(row).toBeVisible()
    await expect(row.getByTestId('rule-state-badge')).toHaveText('Enabled')

    const created = (await listRulesViaApi(page, connectionId)).find(
      (rule) => rule.name === ruleName
    )
    expect(created).toBeTruthy()
    if (created) await deleteRuleViaApi(page, connectionId, created.id)
  })

  test('snoozes a rule for 1 hour from the menu and unsnoozes it', async ({ page }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)
    const ruleName = uniqueName('Snooze target')
    const rule = await createRuleViaApi(page, connectionId, ruleName)

    try {
      await page.goto(`/${orgSlug}/c/${connectionId}/alerts/rules`)
      const row = page.getByTestId('alert-rule-row').filter({ hasText: ruleName })
      await expect(row.getByTestId('rule-state-badge')).toHaveText('Enabled')

      await row.getByRole('button', { name: `Snooze options for ${ruleName}` }).click()
      await page.getByRole('menuitem', { name: 'Snooze 1 hour' }).click()
      await expect(row.getByTestId('rule-state-badge')).toContainText('Snoozed')

      await row.getByRole('button', { name: `Snooze options for ${ruleName}` }).click()
      await page.getByRole('menuitem', { name: 'Unsnooze' }).click()
      await expect(row.getByTestId('rule-state-badge')).toHaveText('Enabled')
    } finally {
      await deleteRuleViaApi(page, connectionId, rule.id)
    }
  })

  test('duplicate opens the builder with a "(copy)" name', async ({ page }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)
    const ruleName = uniqueName('Duplicate source')
    const rule = await createRuleViaApi(page, connectionId, ruleName)

    try {
      await page.goto(`/${orgSlug}/c/${connectionId}/alerts/rules`)
      const row = page.getByTestId('alert-rule-row').filter({ hasText: ruleName })
      // exact: true — the snooze trigger's aria-label contains the rule name,
      // which itself contains the word "Duplicate".
      await row.getByRole('button', { name: 'Duplicate', exact: true }).click()

      await expect(page).toHaveURL(new RegExp(`/alerts/new\\?from=${rule.id}$`))
      await expect(page.getByTestId('alert-rule-name-input')).toHaveValue(`${ruleName} (copy)`)
    } finally {
      await deleteRuleViaApi(page, connectionId, rule.id)
    }
  })

  test('deletes a rule through the confirm dialog', async ({ page }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)
    const ruleName = uniqueName('Delete target')
    const rule = await createRuleViaApi(page, connectionId, ruleName)

    await page.goto(`/${orgSlug}/c/${connectionId}/alerts/rules`)
    const row = page.getByTestId('alert-rule-row').filter({ hasText: ruleName })
    // exact: true — the snooze trigger's aria-label contains the rule name,
    // which itself contains the word "Delete".
    await row.getByRole('button', { name: 'Delete', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Delete alert rule')).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete rule' }).click()

    await expect(row).toHaveCount(0)
    const remaining = await listRulesViaApi(page, connectionId)
    expect(remaining.some((candidate) => candidate.id === rule.id)).toBe(false)
  })

  test('creates and deletes an email destination in settings', async ({ page }) => {
    const { orgSlug } = await getAuthlessRuntimeContext(page)
    const destinationName = uniqueName('Ops inbox')

    await page.goto(`/${orgSlug}/settings/destinations`)
    await expect(page.getByText('Alert destinations').first()).toBeVisible()

    await page.getByRole('button', { name: 'Add destination' }).first().click()
    const createDialog = page.getByRole('dialog')
    await createDialog.getByTestId('destination-type-email').click()
    await createDialog.getByLabel('Name').fill(destinationName)
    await createDialog.getByLabel('Recipient email').fill('oncall@example.com')
    await createDialog.getByRole('button', { name: 'Create destination' }).click()

    const row = page.getByTestId('alert-destination-row').filter({ hasText: destinationName })
    await expect(row).toBeVisible()
    await expect(row.getByText('Email', { exact: true })).toBeVisible()
    // Freshly created destination is referenced by zero rules.
    await expect(row.getByText('Not in use')).toBeVisible()
    await expect(row.getByText('oncall@example.com')).toBeVisible()

    await row.getByRole('button', { name: 'Delete' }).click()
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog.getByText('Delete destination')).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(row).toHaveCount(0)
    const remaining = await listDestinationsViaApi(page)
    const leftover = remaining.find((candidate) => candidate.name === destinationName)
    if (leftover) {
      // Safety net so a failed UI delete does not leak state into other tests.
      await deleteDestinationViaApi(page, leftover.id)
      throw new Error('Destination was still present after UI delete.')
    }
  })

  test('legacy alerts URLs redirect to the new rules routes', async ({ page }) => {
    const { orgSlug, connectionId } = await getAuthlessRuntimeContext(page)
    const ruleName = uniqueName('Legacy redirect')
    const rule = await createRuleViaApi(page, connectionId, ruleName)

    try {
      // Old tab-based deep link: ?tab=rules → /alerts/rules.
      await page.goto(`/${orgSlug}/c/${connectionId}/alerts?tab=rules`)
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/c/${connectionId}/alerts/rules/?$`))
      await expect(page.getByTestId('alert-rule-row').filter({ hasText: ruleName })).toBeVisible()

      // Old rule deep link: /alerts/:ruleId → /alerts/rules/:ruleId (edit builder).
      await page.goto(`/${orgSlug}/c/${connectionId}/alerts/${rule.id}`)
      await expect(page).toHaveURL(
        new RegExp(`/${orgSlug}/c/${connectionId}/alerts/rules/${rule.id}$`)
      )
      await expect(page.getByTestId('alert-rule-name-input')).toHaveValue(ruleName)
      await expect(page.getByRole('button', { name: 'Run live test' })).toBeVisible()
    } finally {
      await deleteRuleViaApi(page, connectionId, rule.id)
    }
  })

  // Incident acknowledge/resolve is intentionally NOT covered here: alert
  // events are only created by the background alert monitor when real queue
  // failures occur (60s poll cadence), and there is no public API endpoint to
  // insert an alert event. The deterministic e2e stack runs no workers, so no
  // job ever fails, and seeding a firing incident would require poking the
  // database directly or adding a backend test endpoint — both out of bounds.
  // Ack/resolve behavior is covered by component tests
  // (connection-incidents-view.test.tsx, alert-events-table.test.tsx,
  // org-alerts-feed.test.tsx) and the API route tests in apps/api.
})

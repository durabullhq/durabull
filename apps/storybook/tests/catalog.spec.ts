import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const index = JSON.parse(readFileSync(new URL('../dist/index.json', import.meta.url), 'utf8')) as {
  entries: Record<string, { id: string; type: string; title: string; name: string }>
}
for (const story of Object.values(index.entries).filter((entry) => entry.type === 'story')) {
  test(`${story.title} / ${story.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /Missing Storybook fixture|Public Storybook blocked|Cannot read|TypeError|ZodError/.test(
          message.text()
        )
      )
        errors.push(message.text())
    })
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`)
    await expect(page.locator('body')).toHaveClass(/sb-show-main/)
    await page.waitForTimeout(700)
    await expect(page.locator('.sb-errordisplay')).not.toBeVisible()
    await expect(page.getByText('Something went wrong!', { exact: true })).not.toBeVisible()
    expect(errors).toEqual([])
    if (story.title.startsWith('MCP Apps') && !['Connecting', 'Read Error'].includes(story.name)) {
      const frame = page.frameLocator('iframe[title="Durabull MCP app"]')
      await expect(frame.locator('#app')).not.toContainText('Connecting to Durabull')
      await expect(frame.locator('[role="alert"]')).not.toBeVisible()
    }
  })
}

test('MCP navigation calls local read tools and records assistant requests', async ({ page }) => {
  await page.goto('/iframe.html?id=mcp-apps-queue--in-chat-gpt&viewMode=story')
  const app = page.frameLocator('iframe[title="Durabull MCP app"]')
  await app.getByRole('button', { name: 'Browse jobs', exact: true }).click()
  await expect(app.getByRole('button', { name: 'job-1042', exact: true })).toBeVisible()
  await app.getByRole('button', { name: 'job-1042', exact: true }).click()
  await app.getByRole('button', { name: /retry/i }).click()
  await page.getByText(/Host activity/).click()
  await expect(page.locator('details pre')).toContainText('get_job')
  await expect(page.locator('details pre')).toContainText(/retry/i)
})

test('controlled job options remain editable', async ({ page }) => {
  await page.goto('/iframe.html?id=web-components-job-options-fields--default&viewMode=story')
  const attempts = page.getByLabel('Attempts', { exact: true })
  await attempts.fill('5')
  await expect(attempts).toHaveValue('5')
})

test('theme and mobile viewport use production styles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(
    '/iframe.html?id=foundations-primitives--buttons&viewMode=story&globals=theme:dark'
  )
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'default · sm', exact: true })).toBeVisible()
})

test('secret visibility toggles without changing its value', async ({ page }) => {
  await page.goto('/iframe.html?id=web-components-secret-input--default&viewMode=story')
  const input = page.getByPlaceholder('Enter a secret')
  await expect(input).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show secret', exact: true }).click()
  await expect(input).toHaveAttribute('type', 'text')
  await expect(input).toHaveValue('demo-secret-only')
})

test('scheduled job detail renders the editable production form', async ({ page }) => {
  await page.goto('/iframe.html?id=web-screens-connection-scheduler-detail--default&viewMode=story')
  await expect(page.getByLabel('Job Name', { exact: true })).toHaveValue('send-summary')
})

test('MCP operation receipts refresh state through read tools', async ({ page }) => {
  await page.goto('/iframe.html?id=mcp-apps-operation-receipt--job-retried&viewMode=story')
  const app = page.frameLocator('iframe[title="Durabull MCP app"]')
  await expect(app.getByRole('region', { name: 'Operation result' })).toBeVisible()
  await app.getByRole('button', { name: 'Inspect current state', exact: true }).click()
  await page.getByText(/Host activity/).click()
  await expect(page.locator('details pre')).toHaveText('get_job')
})

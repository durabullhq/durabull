import { expect, test } from '@playwright/test'

test('marketing links to the nested catalog and fixtures only control /ui/', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'UI catalog', exact: true }).click()
  await expect(page).toHaveURL(/\/ui\//)
  await page.goto('/ui/?path=/story/web-screens-connection-queue-detail--default')
  const preview = page.frameLocator('#storybook-preview-iframe')
  await expect(preview.locator('body')).toHaveClass(/sb-show-main/)
  await expect(preview.getByRole('link', { name: 'job-1042', exact: true })).toBeVisible()
  const frame = page.frames().find((entry) => entry.url().includes('/ui/iframe.html'))!
  const scope = await frame.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return new URL(registration.scope).pathname
  })
  expect(scope).toBe('/ui/')
  await page.goto('/')
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
  ).toBeNull()
})

test('MCP bridge and production assets work under /ui/', async ({ page, request }) => {
  for (const asset of [
    '/ui/mockServiceWorker.js',
    '/fonts/Geist-Variable.woff2',
    '/screenshots/queues.png',
    '/ui/index.json',
  ]) {
    const response = await request.get(asset)
    expect(response.ok(), asset).toBe(true)
    expect(response.headers()['content-type'], asset).not.toContain('text/html')
  }
  await page.goto('/ui/iframe.html?id=mcp-apps-queue--in-chat-gpt&viewMode=story')
  const app = page.frameLocator('iframe[title="Durabull MCP app"]')
  await app.getByRole('button', { name: 'Browse jobs', exact: true }).click()
  await expect(app.getByRole('button', { name: 'job-1042', exact: true })).toBeVisible()
})

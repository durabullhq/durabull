import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createJob,
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getTestQueueName,
  removeJobs,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const screenshotDir = path.join(__dirname, 'screenshots')

async function safeRemoveJobs(
  page: Parameters<typeof removeJobs>[0],
  options: Parameters<typeof removeJobs>[1]
) {
  try {
    await removeJobs(page, options)
  } catch (error) {
    console.warn('Failed to cleanup jobs:', error)
  }
}

test.describe('Queues page prioritized visibility (issue #116)', () => {
  test('surfaces prioritized jobs in the summary card and queue table', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const createdJobs: string[] = []

    try {
      // Prioritized jobs require an explicit priority. With no worker consuming
      // the queue during E2E, the job settles into the "prioritized" state.
      for (let i = 0; i < 3; i++) {
        const jobId = await createJob(page, {
          connectionId,
          queueName,
          name: `e2e-prioritized-${Date.now()}-${i}`,
          data: { e2e: true, prioritized: true },
          priority: i + 1,
        })
        createdJobs.push(jobId)
      }

      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/`)

      // Summary stat card for Prioritized is present on the overview.
      const prioritizedCard = page.getByText('Prioritized', { exact: true }).first()
      await expect(prioritizedCard).toBeVisible({ timeout: 15000 })

      // The queue table exposes a Prioritized column.
      await expect(page.getByRole('columnheader', { name: 'Prioritized' })).toBeVisible()

      // The seeded prioritized jobs surface on the page (count reflected in the row).
      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `/api/c/${connectionId}/queues?page=1&pageSize=100`
            )
            if (!response.ok()) return 0
            const data = (await response.json()) as {
              totalJobCounts?: { prioritized?: number }
            }
            return data.totalJobCounts?.prioritized ?? 0
          },
          { timeout: 15000 }
        )
        .toBeGreaterThanOrEqual(3)

      await page.screenshot({
        path: path.join(screenshotDir, 'queues-overview-prioritized.png'),
        fullPage: true,
      })

      // Focused capture of the summary cards row.
      const cardsRow = page.locator('.grid').first()
      await cardsRow.screenshot({
        path: path.join(screenshotDir, 'queues-summary-cards-prioritized.png'),
      })
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
    }
  })
})

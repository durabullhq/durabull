import {
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getScheduledJobs,
  getTestQueueName,
  removeScheduledJob,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

test.describe('Scheduled Jobs', () => {
  test('creates a recurring job from queue detail and lands on its edit page', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const jobName = `e2e-scheduled-${Date.now()}`
    const schedulerId = `e2e-scheduler-${Date.now()}`
    let createdScheduler = false

    try {
      await page.goto(
        `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${encodeURIComponent(queueName)}?tab=scheduled`
      )

      const scheduleButton = page.getByRole('button', { name: 'Schedule Job' }).first()
      await expect(scheduleButton).toBeVisible({ timeout: 15000 })
      await scheduleButton.click()

      await expect(page).toHaveURL(
        new RegExp(`/queues/${encodeURIComponent(queueName)}/scheduled-jobs/new$`)
      )

      await page.getByLabel('Job name').fill(jobName)
      await page.getByLabel('Scheduler ID').fill(schedulerId)
      await page.getByRole('button', { name: /Fixed interval/i }).click()
      await page.getByLabel('Interval (ms)').fill('300000')

      await page.getByRole('button', { name: 'Create scheduled job' }).click()

      await expect(page).toHaveURL(
        new RegExp(`/queues/${encodeURIComponent(queueName)}/scheduled-jobs/${schedulerId}$`),
        { timeout: 15000 }
      )

      const editPageTitle = page.getByRole('heading', { name: jobName, exact: true, level: 1 })
      await expect(editPageTitle).toBeVisible({ timeout: 15000 })

      await expect
        .poll(
          async () => {
            const data = await getScheduledJobs(page, connectionId)
            return data.scheduledJobs.some(
              (job) => job.queueName === queueName && job.schedulerId === schedulerId
            )
          },
          { timeout: 15000 }
        )
        .toBe(true)

      createdScheduler = true
    } finally {
      if (createdScheduler) {
        await removeScheduledJob(page, { connectionId, queueName, schedulerId })
      }
    }
  })
})

import {
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getScheduledJobs,
  getScheduledJobsForQueue,
  getTestQueueName,
  removeScheduledJob,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

test.describe('Scheduled jobs lifecycle', () => {
  test('edit page saves changes and the API reflects the update', async ({ page }) => {
    // Creates through the UI, waits out a toast, then polls the API for the
    // update; the default 30s budget is not enough for that whole round trip.
    test.slow()
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const schedulerId = `e2e-edit-${Date.now()}`
    const jobName = `e2e-edit-job-${Date.now()}`

    // Create through the UI (same flow as scheduled-jobs.spec.ts) so we own cleanup.
    await page.goto(
      `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${encodeURIComponent(queueName)}?tab=scheduled`
    )
    const scheduleButton = page.getByRole('button', { name: 'Schedule Job' }).first()
    await expect(scheduleButton).toBeVisible({ timeout: 15000 })
    await scheduleButton.click()

    await expect(page).toHaveURL(
      new RegExp(`/queues/${encodeURIComponent(queueName)}/scheduled-jobs/new$`)
    )
    await page.getByLabel('Job Name').fill(jobName)
    await page.getByLabel('Scheduler ID').fill(schedulerId)
    await page.getByRole('button', { name: /Fixed interval/i }).click()
    await page.getByLabel('Interval (ms)').fill('600000')
    await page.getByRole('button', { name: 'Create Scheduled Job' }).click()
    await expect(page).toHaveURL(
      new RegExp(`/queues/${encodeURIComponent(queueName)}/scheduled-jobs/${schedulerId}$`),
      { timeout: 15000 }
    )

    try {
      // The "Scheduled job created" toast overlays the footer and intercepts the
      // save click. Toasts are client state, so reload to land on a clean form.
      await page.reload()

      // Edit the job name on the detail page.
      const nameInput = page.locator('#scheduled-job-name')
      await expect(nameInput).toBeVisible({ timeout: 15000 })
      const updatedName = `${jobName}-v2`

      await nameInput.fill(updatedName)
      const saveButton = page.getByRole('button', { name: 'Save Changes' })
      await expect(saveButton).toBeEnabled()
      await saveButton.click()

      // The API returns the updated job name for this scheduler.
      await expect
        .poll(
          async () => {
            const data = await getScheduledJobsForQueue(page, connectionId, queueName)
            return data.scheduledJobs.find((job) => job.schedulerId === schedulerId)?.jobName ?? ''
          },
          { timeout: 20000 }
        )
        .toBe(updatedName)
    } finally {
      try {
        await removeScheduledJob(page, { connectionId, queueName, schedulerId })
      } catch (error) {
        console.warn('Failed to cleanup scheduled job:', error)
      }
    }
  })

  test('scheduled tab lists seeded schedulers grouped by queue', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)

    const data = await getScheduledJobs(page, connectionId)
    if (data.total === 0) {
      throw new Error('No scheduled jobs found. Ensure seed data is loaded.')
    }

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/scheduled-jobs`)
    await expect(
      page.getByRole('heading', { name: 'Scheduled Jobs', exact: true, level: 1 })
    ).toBeVisible()
    await expect(page.getByText('Scheduled Jobs by Queue')).toBeVisible()

    const first = data.scheduledJobs[0]
    const groupTrigger = page.getByRole('button').filter({ hasText: first.queueName }).first()
    await expect(groupTrigger).toBeVisible()
  })
})

import {
  createJob,
  deleteQueue,
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getJob,
  getTestQueueName,
  removeJobs,
  retryFailedJobs,
  runQueueDiscovery,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

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

test.describe('Queue operations', () => {
  test('add job dialog creates a job that appears in the jobs table', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const jobName = `e2e-add-job-${Date.now()}`
    const createdJobs: string[] = []

    try {
      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${encodeURIComponent(queueName)}`)

      await page.getByRole('button', { name: 'Add Job' }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await dialog.locator('#job-name').fill(jobName)

      // The JSON editor is CodeMirror-based; type into the focused content area.
      const jsonArea = dialog.locator('.cm-content').first()
      await jsonArea.click()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type(JSON.stringify({ e2e: true, source: 'add-job-dialog' }))

      await dialog.getByRole('button', { name: 'Add Job' }).click()

      // Dialog closes on success and a toast confirms creation with the job id.
      await expect(dialog).not.toBeVisible({ timeout: 15000 })
      await expect(page.getByText(/Job ID:/)).toBeVisible({ timeout: 15000 })

      // The new job is findable through the API by name.
      let jobId: string | null = null
      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs?name=${encodeURIComponent(jobName)}&page=1&pageSize=10`
            )
            if (!response.ok()) return false
            const data = (await response.json()) as { jobs: Array<{ id: string | number }> }
            if (data.jobs.length === 0) return false
            jobId = String(data.jobs[0].id)
            return true
          },
          { timeout: 15000 }
        )
        .toBe(true)

      if (jobId) createdJobs.push(jobId)

      const job = await getJob(page, connectionId, queueName, String(jobId))
      expect(job.name).toBe(jobName)
      expect((job.data as { source?: string })?.source).toBe('add-job-dialog')
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
    }
  })

  test('purge removes delayed jobs and keeps the most recent N', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    // Purging is destructive, so this runs on a queue of its own. The shared seed
    // queue carries job schedulers whose delayed jobs BullMQ refuses to remove,
    // which makes the purge fail with a 409.
    const queueName = `e2e-purge-${Date.now()}`
    const createdJobs: string[] = []
    const keepMostRecent = 1

    try {
      // Seed five delayed jobs so the purge has a deterministic target set.
      for (let i = 0; i < 5; i++) {
        const jobId = await createJob(page, {
          connectionId,
          queueName,
          name: `e2e-purge-${Date.now()}-${i}`,
          data: { e2e: true, purgeTest: true },
          delay: 30 * 60 * 1000,
        })
        createdJobs.push(jobId)
      }

      // The queue only exists in Redis until discovery registers it for the UI.
      await runQueueDiscovery(page, connectionId)

      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${encodeURIComponent(queueName)}`)
      await expect(
        page.getByRole('heading', { name: queueName, exact: true, level: 1 })
      ).toBeVisible()

      await page.getByRole('button', { name: 'Purge / Retain' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Purge Queue Jobs')).toBeVisible()

      // The confirm input stays disabled until at least one status is selected;
      // click the label row (the styled checkbox is visually hidden from a11y).
      const delayedRow = dialog.locator('label').filter({ hasText: 'Delayed' })
      await delayedRow.click()
      await expect(delayedRow.locator('input')).toBeChecked()

      // Confirm input enables after selecting a status.
      const confirmInput = dialog.locator('#purge-queue-confirm-input')
      await expect(confirmInput).toBeEnabled()
      await confirmInput.fill(queueName)

      const keepInput = dialog.getByTestId('purge-queue-keep-most-recent-input')
      await keepInput.fill(String(keepMostRecent))

      const submitButton = dialog.getByRole('button', { name: 'Purge Jobs' })
      await expect(submitButton).toBeEnabled()

      // Watch the purge request so a server-side rejection surfaces as a
      // test failure with the real status instead of a missing toast.
      const purgeResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/purge') && resp.request().method() === 'POST',
        { timeout: 20000 }
      )
      await submitButton.click()
      const purgeResponse = await purgeResponsePromise
      expect(purgeResponse.status()).toBe(200)

      // Dialog closes on success.
      await expect(dialog).not.toBeVisible({ timeout: 15000 })

      // Exactly one of the five created delayed jobs survives (the most recent).
      await expect
        .poll(
          async () => {
            let alive = 0
            for (const jobId of createdJobs) {
              const detail = await getJob(page, connectionId, queueName, jobId).catch(() => null)
              if (detail) alive += 1
            }
            return alive
          },
          { timeout: 20000 }
        )
        .toBe(keepMostRecent)
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
      // The queue is this test's own, so drop it once it is empty.
      await deleteQueue(page, connectionId, queueName).catch((error) => {
        console.warn(`Failed to delete queue ${queueName}:`, error)
      })
    }
  })

  test('retry queue dialog opens from queue actions and cancels cleanly', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${encodeURIComponent(queueName)}`)
    await expect(
      page.getByRole('heading', { name: queueName, exact: true, level: 1 })
    ).toBeVisible()

    // The Retry Jobs dialog lives in the queue settings dropdown on the detail page.
    await page.getByRole('button', { name: 'Queue settings' }).click()
    await page.getByRole('menuitem', { name: 'Retry Jobs' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Retry Queue Jobs')).toBeVisible()

    // Cancel leaves state untouched.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()

    // Verify the underlying bulk retry endpoint behaves correctly.
    await retryFailedJobs(page, connectionId, queueName)
    const failedAfter = await page.request.get(
      `/api/c/${connectionId}/queues/${encodeURIComponent(queueName)}/jobs?status=failed&page=1&pageSize=5`
    )
    expect(failedAfter.ok()).toBeTruthy()
  })
})

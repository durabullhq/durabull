import {
  createJob,
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getJob,
  getJobs,
  getQueues,
  getTestQueueName,
  removeJobs,
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

async function getJobLogsCount(
  page: Parameters<typeof removeJobs>[0],
  connectionId: string,
  queueName: string,
  jobId: string
): Promise<number> {
  const response = await page.request.get(
    `/api/c/${connectionId}/queues/${queueName}/jobs/${jobId}/logs?page=1&pageSize=1`
  )
  if (!response.ok()) {
    throw new Error(`Failed to get logs for ${queueName}/${jobId}: ${response.status()}`)
  }
  const data = (await response.json()) as { count?: number }
  return data.count ?? 0
}

async function findJobWithLogs(
  page: Parameters<typeof removeJobs>[0],
  connectionId: string,
  minLogs: number
): Promise<{ queueName: string; jobId: string; logCount: number } | null> {
  const queues = await getQueues(page, connectionId)
  for (const queue of queues) {
    const jobs = await getJobs(page, connectionId, queue.name, { page: 1, pageSize: 25 })
    for (const job of jobs.jobs) {
      const logCount = await getJobLogsCount(page, connectionId, queue.name, String(job.id))
      if (logCount >= minLogs) {
        return { queueName: queue.name, jobId: String(job.id), logCount }
      }
    }
  }
  return null
}

async function findFailedJobWithStacktraces(
  page: Parameters<typeof removeJobs>[0],
  connectionId: string,
  minStacktraces: number
): Promise<{ queueName: string; jobId: string; stacktraceCount: number } | null> {
  const queues = await getQueues(page, connectionId)
  for (const queue of queues) {
    const jobs = await getJobs(page, connectionId, queue.name, {
      status: 'failed',
      page: 1,
      pageSize: 25,
    })
    for (const job of jobs.jobs) {
      const detail = await getJob(page, connectionId, queue.name, String(job.id))
      const stacktraceCount = detail.stacktraceCount ?? 0
      if (stacktraceCount >= minStacktraces) {
        return { queueName: queue.name, jobId: String(job.id), stacktraceCount }
      }
    }
  }
  return null
}

test.describe('Jobs', () => {
  test('job detail shows duplicate dialog', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const createdJobs: string[] = []

    try {
      const jobId = await createJob(page, {
        connectionId,
        queueName,
        name: `e2e-job-${Date.now()}`,
        data: { e2e: true },
      })
      createdJobs.push(jobId)

      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}/jobs/${jobId}`)

      const duplicateButton = page.getByRole('button', { name: 'Duplicate' })
      await expect(duplicateButton).toBeEnabled({ timeout: 15000 })
      await duplicateButton.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Duplicate Job')).toBeVisible()

      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).not.toBeVisible()
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
    }
  })

  test('search filters jobs by data payload', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const createdJobs: string[] = []

    try {
      const token = `e2e-payload-${Date.now()}`
      const jobId = await createJob(page, {
        connectionId,
        queueName,
        name: `e2e-data-search-${Date.now()}`,
        data: { message: token },
        // Keep the job out of active processing so it stays findable.
        delay: 10 * 60 * 1000,
      })
      createdJobs.push(jobId)

      // API: searching the payload finds the job; a non-matching term does not.
      await expect
        .poll(
          async () => {
            const result = await getJobs(page, connectionId, queueName, { data: token })
            return result.jobs.map((job) => String(job.id))
          },
          { timeout: 15000 }
        )
        .toContain(jobId)

      const miss = await getJobs(page, connectionId, queueName, { data: `${token}-nope` })
      expect(miss.jobs.map((job) => String(job.id))).not.toContain(jobId)

      // UI: the data search input narrows the table to the matching job.
      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`)
      const dataInput = page.getByLabel('Search jobs by data payload')
      await expect(dataInput).toBeVisible({ timeout: 15000 })

      await dataInput.fill(token)
      await expect(page.getByTestId(`job-row-${jobId}`)).toBeVisible({ timeout: 15000 })

      await dataInput.fill(`${token}-nope`)
      await expect(page.getByTestId(`job-row-${jobId}`)).toHaveCount(0, { timeout: 15000 })
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
    }
  })

  test('invoke promotes a delayed job', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const createdJobs: string[] = []

    try {
      const jobId = await createJob(page, {
        connectionId,
        queueName,
        name: `e2e-delayed-${Date.now()}`,
        data: { e2e: true, delayed: true },
        delay: 10 * 60 * 1000,
      })
      createdJobs.push(jobId)

      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}/jobs/${jobId}`)
      const invokeButton = page.getByRole('button', { name: 'Invoke' })
      await expect(invokeButton).toBeVisible({ timeout: 15000 })
      await expect(invokeButton).toBeEnabled()

      await invokeButton.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Invoke Job')).toBeVisible()

      const invokeNowButton = dialog.getByRole('button', { name: 'Invoke Now' })
      await expect(invokeNowButton).toBeEnabled()
      await invokeNowButton.click()
      await page.waitForURL(new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`), {
        timeout: 15000,
      })

      await expect
        .poll(
          async () => {
            const job = await getJob(page, connectionId, queueName, jobId)
            return job.status
          },
          { timeout: 15000 }
        )
        .not.toBe('delayed')
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
    }
  })

  test('remove job from detail page', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const queueName = await getTestQueueName(page, connectionId)
    const createdJobs: string[] = []

    try {
      const jobId = await createJob(page, {
        connectionId,
        queueName,
        name: `e2e-remove-${Date.now()}`,
        data: { e2e: true },
        // Keep the job out of active processing while validating remove behavior.
        delay: 10 * 60 * 1000,
      })
      createdJobs.push(jobId)

      await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}/jobs/${jobId}`)
      await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

      await page.getByRole('button', { name: 'Remove' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('button', { name: 'Remove Job' }).click()
      await page.waitForURL(new RegExp(`/${TEST_ORG_SLUG}/c/${connectionId}/queues/${queueName}`))

      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              `/api/c/${connectionId}/queues/${queueName}/jobs/${jobId}`
            )
            return response.status()
          },
          { timeout: 15000 }
        )
        .toBe(404)
    } finally {
      await safeRemoveJobs(page, { connectionId, queueName, jobIds: createdJobs })
    }
  })

  test('clear logs keeps most recent X logs', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const target = await findJobWithLogs(page, connectionId, 15)
    test.skip(!target, 'No job with enough logs found in seed data.')
    if (!target) return

    const keepMostRecent = 10
    await page.goto(
      `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${target.queueName}/jobs/${target.jobId}?tab=logs`
    )

    const clearButton = page.getByRole('button', { name: /Clear Logs/i })
    await expect(clearButton).toBeVisible({ timeout: 15000 })
    await clearButton.click()
    await page.getByRole('menuitem', { name: `Keep latest ${keepMostRecent} logs` }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: `Keep ${keepMostRecent} logs` }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await expect
      .poll(async () => {
        const count = await getJobLogsCount(page, connectionId, target.queueName, target.jobId)
        return count
      })
      .toBe(keepMostRecent)
  })

  test('clear stacktraces keeps most recent X stacktraces', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)
    const target = await findFailedJobWithStacktraces(page, connectionId, 15)
    test.skip(!target, 'No failed job with enough stacktraces found in seed data.')
    if (!target) return

    const keepMostRecent = 10
    await page.goto(
      `/${TEST_ORG_SLUG}/c/${connectionId}/queues/${target.queueName}/jobs/${target.jobId}?tab=attempts`
    )

    const clearButton = page.getByRole('button', { name: /Clear Stacktraces/i })
    await expect(clearButton).toBeVisible({ timeout: 15000 })
    await clearButton.click()
    await page.getByRole('menuitem', { name: `Keep latest ${keepMostRecent}`, exact: true }).click()

    await expect
      .poll(async () => {
        const detail = await getJob(page, connectionId, target.queueName, target.jobId)
        return detail.stacktraceCount ?? 0
      })
      .toBe(keepMostRecent)
  })
})

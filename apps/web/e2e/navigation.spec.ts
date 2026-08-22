import {
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getScheduledJobs,
  getTestQueueName,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

test('dashboard navigation and core pages', async ({ page }) => {
  await ensureActiveOrg(page)
  const connectionId = await getDefaultConnectionId(page)
  const queueName = await getTestQueueName(page, connectionId)

  // Dashboard queues
  await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}`)
  await expect(page.getByTestId('connection-selector')).toBeVisible()
  await expect(page.getByTestId(`queue-row-${queueName}`)).toBeVisible()

  // Connections page
  await page.goto(`/${TEST_ORG_SLUG}/connections`)
  await expect(
    page.getByRole('heading', { name: 'Connections', exact: true, level: 1 })
  ).toBeVisible()
  await expect(page.getByTestId(`connection-card-${connectionId}`)).toBeVisible()

  await page.getByTestId('add-connection-button').click()
  await expect(page.getByRole('heading', { name: 'Add Connection' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(
    page.getByRole('heading', { name: 'Connections', exact: true, level: 1 })
  ).toBeVisible()

  // Scheduled jobs page
  const scheduledJobs = await getScheduledJobs(page, connectionId)
  if (scheduledJobs.total === 0) {
    throw new Error('No scheduled jobs found. Ensure seed data is loaded.')
  }

  await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/scheduled-jobs`)
  await expect(
    page.getByRole('heading', { name: 'Scheduled Jobs', exact: true, level: 1 })
  ).toBeVisible()
  await expect(page.getByText('Scheduled Jobs by Queue')).toBeVisible()
  await expect(page.getByText(scheduledJobs.scheduledJobs[0].queueName)).toBeVisible()

  // Workers page
  await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/workers`)
  await expect(page.getByRole('heading', { name: 'Workers', exact: true, level: 1 })).toBeVisible()
})

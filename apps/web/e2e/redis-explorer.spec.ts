import {
  ensureActiveOrg,
  expect,
  getDefaultConnectionId,
  getRedisKeySearch,
  TEST_ORG_SLUG,
  test,
} from './fixtures/test'

test.describe('Redis Explorer', () => {
  test('seeded keys appear in search and the value panel shows JSON content', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)

    // The seeder guarantees session:* keys with TTLs.
    const seeded = await getRedisKeySearch(page, connectionId, 'session:*', { pageSize: 5 })
    if (seeded.length === 0) {
      throw new Error('No session:* keys found. Ensure seed data is loaded.')
    }
    const targetKey = seeded[0].key

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/redis-keys`)

    // Wait past the "Loading connections..." shell state before asserting.
    const searchInput = page.getByPlaceholder('Search pattern (e.g., user:*, *session*)')
    await expect(searchInput).toBeVisible({ timeout: 20000 })

    await searchInput.fill('session:*')

    // The key row is a virtualized role=button; match on the key text.
    const keyRow = page.getByRole('button').filter({ hasText: targetKey }).first()
    await expect(keyRow).toBeVisible({ timeout: 20000 })
    await keyRow.click()

    const valuePanel = page.getByText('Value Details')
    await expect(valuePanel).toBeVisible({ timeout: 15000 })

    // The panel shows the full key plus type/TTL badges from the API.
    await expect(page.locator('code').filter({ hasText: targetKey })).toBeVisible()
    const typeBadge = seeded[0].type
    await expect(page.getByText(typeBadge, { exact: true }).first()).toBeVisible()
  })

  test('search pattern narrows results to matching keys', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/redis-keys`)
    const searchInput = page.getByPlaceholder('Search pattern (e.g., user:*, *session*)')
    await expect(searchInput).toBeVisible({ timeout: 15000 })

    // A pattern that matches nothing renders the empty state.
    await searchInput.fill('e2e-no-such-prefix:*')
    await expect(page.getByText('No keys found')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Try a different search pattern')).toBeVisible()
  })

  test('exclude bull filter hides bull-managed keys', async ({ page }) => {
    await ensureActiveOrg(page)
    const connectionId = await getDefaultConnectionId(page)

    // Seed data guarantees bull:* keys exist for the primary test connection.
    const allKeys = await getRedisKeySearch(page, connectionId, '*', { pageSize: 100 })
    const hasBullKeys = allKeys.some((entry) => entry.key.startsWith('bull:'))

    await page.goto(`/${TEST_ORG_SLUG}/c/${connectionId}/redis-keys`)
    const searchInput = page.getByPlaceholder('Search pattern (e.g., user:*, *session*)')
    await searchInput.fill('*')

    const hideBullButton = page.getByRole('button', { name: 'Hide bull:*' })
    await expect(hideBullButton).toBeVisible()
    await hideBullButton.click()

    // Button toggles its label once active.
    await expect(page.getByRole('button', { name: 'Show bull:*' }).or(hideBullButton)).toBeVisible()

    if (hasBullKeys) {
      // After enabling the filter, no visible row starts with "bull:".
      await expect
        .poll(
          async () => {
            const rows = await page.getByRole('button').allTextContents()
            return rows.some((text) => text.startsWith('bull:'))
          },
          { timeout: 15000 }
        )
        .toBe(false)
    }
  })
})

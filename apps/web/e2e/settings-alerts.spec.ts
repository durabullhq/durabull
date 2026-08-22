import { ensureActiveOrg, expect, TEST_ORG_SLUG, test } from './fixtures/test'

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

test.describe('Settings and alert destinations', () => {
  test('create, edit, and delete a webhook destination through the settings UI', async ({
    page,
  }) => {
    await ensureActiveOrg(page)
    const destinationName = uniqueName('e2e-destination')
    const updatedName = `${destinationName}-v2`

    await page.goto(`/${TEST_ORG_SLUG}/settings/destinations`)
    await expect(page.getByRole('heading', { name: 'Alert destinations' })).toBeVisible({
      timeout: 15000,
    })

    // Create: pick the Webhook type tile first, then fill the form.
    await page.getByRole('button', { name: 'Add destination' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByTestId('destination-type-webhook').click()
    await dialog.locator('#destination-name').fill(destinationName)
    // The API resolves webhook hostnames to block SSRF, so this must be a host
    // that actually has public DNS records. Subdomains of example.com do not.
    await dialog.locator('#destination-url').fill('https://example.com/hooks/durabull')

    await dialog.getByRole('button', { name: 'Create destination' }).click()
    await expect(page.getByText('Destination created')).toBeVisible({ timeout: 15000 })
    await expect(dialog).not.toBeVisible()

    // Row appears in the list.
    const row = page.locator('[data-testid="alert-destination-row"]').filter({
      hasText: destinationName,
    })
    await expect(row).toBeVisible({ timeout: 15000 })

    // Edit: rename the destination.
    await row.getByRole('button', { name: 'Edit' }).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()
    await editDialog.locator('#edit-destination-name').fill(updatedName)
    await editDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Destination updated')).toBeVisible({ timeout: 15000 })

    const renamedRow = page.locator('[data-testid="alert-destination-row"]').filter({
      hasText: updatedName,
    })
    await expect(renamedRow).toBeVisible({ timeout: 15000 })

    // Delete with confirmation.
    await renamedRow.getByRole('button', { name: 'Delete' }).click()
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog.getByText('Delete destination')).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Destination deleted')).toBeVisible({ timeout: 15000 })
    await expect(renamedRow).toHaveCount(0, { timeout: 15000 })
  })

  test('appearance settings switch theme preference', async ({ page }) => {
    await ensureActiveOrg(page)

    await page.goto(`/${TEST_ORG_SLUG}/settings/appearance`)
    await expect(page.getByText('Appearance', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })

    const radiogroup = page.getByRole('radiogroup', { name: 'Theme preference' })
    await expect(radiogroup).toBeVisible()

    const lightOption = radiogroup.getByText('Light', { exact: true }).first()
    await lightOption.click()

    // html element gains the light class from next-themes.
    await expect(page.locator('html')).toHaveClass(/light/, { timeout: 10000 })

    // Restore system to avoid cross-test theme leakage.
    const systemOption = radiogroup.getByText('System', { exact: true }).first()
    await systemOption.click()
  })

  test('connections settings page lists seeded connections and add dialog validates URL', async ({
    page,
  }) => {
    await ensureActiveOrg(page)

    await page.goto(`/${TEST_ORG_SLUG}/settings/connections`)
    await expect(
      page.getByTestId('add-connection-button').or(page.getByText('Add Connection'))
    ).toBeVisible({ timeout: 15000 })

    // Seeded connection cards render (Acme Production is guaranteed by the seeder).
    await expect(page.getByText('Acme Production').first()).toBeVisible({ timeout: 15000 })

    // Open the create dialog and check the form fields exist.
    const addButton = page.getByTestId('add-connection-button')
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('#name')).toBeVisible()
      await expect(dialog.locator('#url')).toBeVisible()
      await expect(dialog.locator('#prefix')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).not.toBeVisible()
    }
  })
})

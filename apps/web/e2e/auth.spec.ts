import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type APIRequestContext, type Page, request } from '@playwright/test'
import { expect, TEST_ORG_SLUG, test } from './fixtures/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ADMIN_STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'admin.json')
const DEFAULT_BASE_URL = 'http://localhost:5173'
const TEST_USER_PASSWORD = 'password1234'

type Provider = 'google' | 'github'

type SocialProviderConfig = {
  provider: Provider
  buttonLabel: string
}

type OrganizationRecord = {
  id: string
  slug: string
}

type InvitationRecord = {
  id: string
  email: string
  status: string
  organizationId: string
  role: string
}

type SocialSignInPayload = {
  provider: Provider
  callbackURL?: string
  newUserCallbackURL?: string
  requestSignUp?: boolean
}

const SOCIAL_PROVIDERS: SocialProviderConfig[] = [
  { provider: 'google', buttonLabel: 'Continue with Google' },
  { provider: 'github', buttonLabel: 'Continue with GitHub' },
]

function createUniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

function normalizeArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[]
  }
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown[] }).data)
  ) {
    return (payload as { data: T[] }).data
  }
  return []
}

function normalizeObjectPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function expectUrlPath(url: string | undefined, expectedPath: string) {
  expect(url, `Expected URL for path ${expectedPath}`).toBeTruthy()
  const parsed = new URL(url as string)
  expect(parsed.pathname).toBe(expectedPath)
}

async function createAdminApi(baseURL: string): Promise<{
  api: APIRequestContext
  organization: OrganizationRecord
}> {
  const api = await request.newContext({
    baseURL,
    storageState: ADMIN_STORAGE_STATE_PATH,
    extraHTTPHeaders: {
      origin: baseURL,
    },
  })

  const organizationsResponse = await api.get('/api/auth/organization/list')
  expect(organizationsResponse.ok()).toBeTruthy()
  const organizationsPayload = await organizationsResponse.json()
  const organizations = normalizeArrayPayload<OrganizationRecord>(organizationsPayload)

  const organization = organizations.find((org) => org.slug === TEST_ORG_SLUG) ?? organizations[0]
  if (!organization) {
    throw new Error('No organization found for admin test context.')
  }

  return { api, organization }
}

async function createInvitation(
  api: APIRequestContext,
  input: {
    organizationId: string
    email: string
    role?: 'member' | 'admin' | 'owner'
  }
): Promise<InvitationRecord> {
  const response = await api.post('/api/auth/organization/invite-member', {
    data: {
      email: input.email,
      role: input.role ?? 'member',
      organizationId: input.organizationId,
    },
  })
  expect(response.ok()).toBeTruthy()

  const payload = await response.json()
  return normalizeObjectPayload<InvitationRecord>(payload)
}

async function getInvitationStatus(
  api: APIRequestContext,
  input: {
    organizationId: string
    invitationId: string
  }
): Promise<string | null> {
  const response = await api.get(
    `/api/auth/organization/list-invitations?organizationId=${encodeURIComponent(input.organizationId)}`
  )
  expect(response.ok()).toBeTruthy()

  const payload = await response.json()
  const invitations = normalizeArrayPayload<InvitationRecord>(payload)
  const match = invitations.find((invitation) => invitation.id === input.invitationId)
  return match?.status ?? null
}

async function captureSocialSignInPayload(
  page: Page,
  trigger: () => Promise<void>
): Promise<SocialSignInPayload> {
  const routePattern = '**/api/auth/sign-in/social'
  let payload: SocialSignInPayload | null = null

  await page.route(routePattern, async (route) => {
    const requestBody = route.request().postData()
    payload = requestBody
      ? (JSON.parse(requestBody) as SocialSignInPayload)
      : ({} as SocialSignInPayload)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: '/__oauth-mock-complete',
        redirect: false,
      }),
    })
  })

  try {
    await trigger()
    await expect.poll(() => payload, { timeout: 10000 }).not.toBeNull()
    if (!payload) {
      throw new Error('Expected captured social sign-in payload to be available.')
    }
    return payload
  } finally {
    await page.unroute(routePattern)
  }
}

async function signUpUser(page: Page, input: { email: string; password: string; name: string }) {
  await page.goto('/signup')
  await expect(page.getByTestId('signup-form')).toBeVisible()
  await page.getByLabel('Name').fill(input.name)
  await page.getByLabel('Email').fill(input.email)
  await page.getByLabel('Password', { exact: true }).fill(input.password)
  await page.getByLabel('Confirm password', { exact: true }).fill(input.password)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForURL(/\/setup-organization/, { timeout: 20000 })
}

async function signOutFromSetupPage(page: Page) {
  await page.getByRole('button', { name: 'Sign out and use a different account' }).click()
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 })
}

test.describe('Authentication Integration', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test.describe.configure({ mode: 'serial' })

  test('email login works end-to-end and allows sign out', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()

    await page.getByLabel('Email').fill('admin@example.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByTestId('org-selector')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('user-menu').click()
    await page.getByTestId('sign-out').click()
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15000 })
  })

  test('invalid email login shows credential error', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()

    await page.getByLabel('Email').fill('admin@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 10000 })
  })

  test('email signup creates account and routes to organization setup', async ({ page }) => {
    await signUpUser(page, {
      email: createUniqueEmail('signup-flow'),
      password: TEST_USER_PASSWORD,
      name: 'Signup Flow User',
    })

    await expect(page).toHaveURL(/\/setup-organization/)
    await expect(page.getByText('Set Up Your Organization')).toBeVisible()
  })

  test('invite flow for new user works via email signup', async ({ page, baseURL }) => {
    const resolvedBaseURL = baseURL ?? DEFAULT_BASE_URL
    const admin = await createAdminApi(resolvedBaseURL)
    const invitedEmail = createUniqueEmail('invite-signup')

    try {
      const invitation = await createInvitation(admin.api, {
        organizationId: admin.organization.id,
        email: invitedEmail,
      })

      await page.goto(`/invite/${invitation.id}`)
      await expect(page.getByRole('heading', { name: "You've Been Invited" })).toBeVisible()

      await page.getByRole('button', { name: 'Sign up' }).click()
      await page.getByLabel('Name').fill('Invited Signup User')
      await page.getByLabel('Password', { exact: true }).fill(TEST_USER_PASSWORD)
      await page.getByLabel('Confirm Password').fill(TEST_USER_PASSWORD)
      await page.getByRole('button', { name: 'Create Account & Accept Invitation' }).click()

      await page.waitForURL(new RegExp(`/${admin.organization.slug}`), { timeout: 20000 })

      await expect
        .poll(
          () =>
            getInvitationStatus(admin.api, {
              organizationId: admin.organization.id,
              invitationId: invitation.id,
            }),
          { timeout: 15000 }
        )
        .toBe('accepted')
    } finally {
      await admin.api.dispose()
    }
  })

  test('invite flow for existing user works via email login', async ({ page, baseURL }) => {
    const invitedEmail = createUniqueEmail('invite-signin')

    await signUpUser(page, {
      email: invitedEmail,
      password: TEST_USER_PASSWORD,
      name: 'Invited Existing User',
    })
    await signOutFromSetupPage(page)

    const resolvedBaseURL = baseURL ?? DEFAULT_BASE_URL
    const admin = await createAdminApi(resolvedBaseURL)

    try {
      const invitation = await createInvitation(admin.api, {
        organizationId: admin.organization.id,
        email: invitedEmail,
      })

      await page.goto(`/invite/${invitation.id}`)
      await expect(page.getByRole('heading', { name: "You've Been Invited" })).toBeVisible()

      await page.getByLabel('Password').fill(TEST_USER_PASSWORD)
      await page.getByRole('button', { name: 'Sign In & Accept Invitation' }).click()

      await page.waitForURL(new RegExp(`/${admin.organization.slug}`), { timeout: 20000 })

      await expect
        .poll(
          () =>
            getInvitationStatus(admin.api, {
              organizationId: admin.organization.id,
              invitationId: invitation.id,
            }),
          { timeout: 15000 }
        )
        .toBe('accepted')
    } finally {
      await admin.api.dispose()
    }
  })

  test('invite flow blocks acceptance for logged-in email mismatch', async ({ page, baseURL }) => {
    await signUpUser(page, {
      email: createUniqueEmail('invite-mismatch-current'),
      password: TEST_USER_PASSWORD,
      name: 'Mismatch Current User',
    })

    const resolvedBaseURL = baseURL ?? DEFAULT_BASE_URL
    const admin = await createAdminApi(resolvedBaseURL)

    try {
      const invitation = await createInvitation(admin.api, {
        organizationId: admin.organization.id,
        email: createUniqueEmail('invite-mismatch-target'),
      })

      await page.goto(`/invite/${invitation.id}`)
      await expect(page.getByText('Email Mismatch')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Accept Invitation' })).toBeDisabled()
    } finally {
      await admin.api.dispose()
    }
  })

  for (const socialProvider of SOCIAL_PROVIDERS) {
    test(`login social payload is correct for ${socialProvider.provider}`, async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByTestId('login-form')).toBeVisible()

      const payload = await captureSocialSignInPayload(page, async () => {
        await page.getByRole('button', { name: socialProvider.buttonLabel }).click()
      })

      expect(payload.provider).toBe(socialProvider.provider)
      expect(payload.requestSignUp).not.toBe(true)
    })

    test(`signup social payload is correct for ${socialProvider.provider}`, async ({ page }) => {
      await page.goto('/signup')
      await expect(page.getByTestId('signup-form')).toBeVisible()

      const payload = await captureSocialSignInPayload(page, async () => {
        await page.getByRole('button', { name: socialProvider.buttonLabel }).click()
      })

      expect(payload.provider).toBe(socialProvider.provider)
      expect(payload.requestSignUp).toBe(true)
      expectUrlPath(payload.callbackURL, '/setup-organization')
      expectUrlPath(payload.newUserCallbackURL, '/setup-organization')
    })

    test(`invite page social payload is correct for ${socialProvider.provider}`, async ({
      page,
      baseURL,
    }) => {
      const resolvedBaseURL = baseURL ?? DEFAULT_BASE_URL
      const admin = await createAdminApi(resolvedBaseURL)

      try {
        const invitation = await createInvitation(admin.api, {
          organizationId: admin.organization.id,
          email: createUniqueEmail(`invite-social-${socialProvider.provider}`),
        })

        await page.goto(`/invite/${invitation.id}`)
        await expect(page.getByRole('heading', { name: "You've Been Invited" })).toBeVisible()

        const payload = await captureSocialSignInPayload(page, async () => {
          await page.getByRole('button', { name: socialProvider.buttonLabel }).click()
        })

        expect(payload.provider).toBe(socialProvider.provider)
        expect(payload.requestSignUp).toBe(true)
        expectUrlPath(payload.callbackURL, `/invite/${invitation.id}`)
        expectUrlPath(payload.newUserCallbackURL, `/invite/${invitation.id}`)
      } finally {
        await admin.api.dispose()
      }
    })

    test(`login invite-context social payload is correct for ${socialProvider.provider}`, async ({
      page,
    }) => {
      const invitationId = `mock-login-invite-${socialProvider.provider}`

      await page.goto(`/login?invitationId=${invitationId}`)
      await expect(page.getByTestId('login-form')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
        'href',
        `/signup?invitationId=${invitationId}`
      )

      const payload = await captureSocialSignInPayload(page, async () => {
        await page.getByRole('button', { name: socialProvider.buttonLabel }).click()
      })

      expect(payload.provider).toBe(socialProvider.provider)
      expect(payload.requestSignUp).toBe(true)
      expectUrlPath(payload.callbackURL, `/invite/${invitationId}`)
      expectUrlPath(payload.newUserCallbackURL, `/invite/${invitationId}`)
    })

    test(`signup invite-context social payload is correct for ${socialProvider.provider}`, async ({
      page,
    }) => {
      const invitationId = `mock-signup-invite-${socialProvider.provider}`

      await page.goto(`/signup?invitationId=${invitationId}`)
      await expect(page.getByTestId('signup-form')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        `/login?invitationId=${invitationId}`
      )

      const payload = await captureSocialSignInPayload(page, async () => {
        await page.getByRole('button', { name: socialProvider.buttonLabel }).click()
      })

      expect(payload.provider).toBe(socialProvider.provider)
      expect(payload.requestSignUp).toBe(true)
      expectUrlPath(payload.callbackURL, `/invite/${invitationId}`)
      expectUrlPath(payload.newUserCallbackURL, `/invite/${invitationId}`)
    })
  }
})

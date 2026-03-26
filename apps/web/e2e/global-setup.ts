import '@durabull/env'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type FullConfig } from '@playwright/test'

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Ensure .auth directory exists
const authDir = path.join(__dirname, '.auth')
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true })
}

const authStatePath = path.join(__dirname, '.auth/admin.json')
const DEFAULT_E2E_REDIS_URL_ENCRYPTION_KEY =
  '9e6ef92b4f3f1e0e067b0a1c3e928f77c14f357205f143e1e152b95f2d1f7a4c'

function isAuthlessE2EMode(): boolean {
  const value = process.env.DURABULL_AUTHLESS?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes' || value === 'on'
}

function getE2ERedisUrlEncryptionKey(): string {
  return process.env.DURABULL_REDIS_URL_ENCRYPTION_KEY ?? DEFAULT_E2E_REDIS_URL_ENCRYPTION_KEY
}

/**
 * Global setup for E2E tests
 *
 * 1. Seeds the database with test data
 * 2. Waits for API server to be ready
 * 3. Logs in as admin user and saves auth state
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173'
  const authlessMode = isAuthlessE2EMode()
  process.env.DURABULL_REDIS_URL_ENCRYPTION_KEY = getE2ERedisUrlEncryptionKey()

  console.log(`\n🌱 Running global setup (${authlessMode ? 'authless' : 'stateful'})...\n`)

  // Step 1: Seed database only for authenticated/stateful mode.
  if (!authlessMode) {
    await seedDatabase()
  } else {
    console.log('⏭️  Skipping database seed in authless mode')
  }

  // Step 2: Wait for API to be ready (it's proxied through the web server)
  await waitForAPI(baseURL)

  // Step 3: Create storage state.
  if (!authlessMode) {
    await createAuthState(baseURL)
  } else {
    await createEmptyAuthState()
  }

  console.log('\n✅ Global setup complete\n')
}

/**
 * Wait for the API server to be ready by polling the health endpoint
 */
async function waitForAPI(baseURL: string, maxAttempts = 60, delayMs = 1000) {
  console.log('🔄 Waiting for API server...')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseURL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        console.log('   ✓ API server is ready')
        return
      }
    } catch {
      // API not ready yet, wait and retry
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw new Error(`API server not ready after ${maxAttempts} attempts`)
}

async function seedDatabase() {
  console.log('📊 Seeding database...')

  const isCI = !!process.env.CI
  const rootDir = path.resolve(__dirname, '../../../')
  const postgresPort = process.env.DURABULL_POSTGRES_PORT || '55432'
  const redisPort = process.env.DURABULL_REDIS_PORT || '56379'

  // Build the environment for the seed script
  const seedEnv = {
    ...process.env,
    // Ensure DATABASE_URL is set - use env vars or fallback to local Docker defaults
    DATABASE_URL:
      process.env.DATABASE_URL ||
      `postgresql://postgres:postgres@localhost:${postgresPort}/durabull`,
    REDIS_URL: process.env.REDIS_URL || `redis://localhost:${redisPort}`,
    DURABULL_REDIS_URL_ENCRYPTION_KEY: getE2ERedisUrlEncryptionKey(),
  }

  if (isCI) {
    console.log('   CI mode detected')
    console.log(`   DATABASE_URL: ${seedEnv.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`)
    console.log(`   REDIS_URL: ${seedEnv.REDIS_URL}`)
  }

  try {
    // Run the seed script directly (not through docker:seed which has hardcoded URLs)
    const output = execSync('bun tooling/scripts/seed/index.ts', {
      cwd: rootDir,
      stdio: 'pipe',
      env: seedEnv,
      timeout: 60000, // 60 second timeout
    })
    console.log('   ✓ Database seeded successfully')
    if (isCI && output.toString()) {
      console.log('   Output:', output.toString().slice(0, 500))
    }
  } catch (error) {
    // Capture and log the actual error
    const execError = error as { stderr?: Buffer; stdout?: Buffer; message?: string; status?: number }
    const stderr = execError.stderr?.toString() || ''
    const stdout = execError.stdout?.toString() || ''

    if (isCI) {
      // In CI, the database should be fresh - seed must succeed
      console.error('   ✗ Seed script failed in CI:')
      console.error(`   Exit status: ${execError.status}`)
      if (stdout) console.error('   stdout:', stdout.slice(0, 2000))
      if (stderr) console.error('   stderr:', stderr.slice(0, 2000))
      throw new Error(`Seed script failed in CI: ${execError.message || 'Unknown error'}`)
    }

    // Locally, seeding might fail because data already exists - that's OK
    console.log('   ⚠ Seed script returned non-zero (data may already exist)')
    if (stderr && !stderr.includes('already exists')) {
      console.log('   Debug output:', stderr.slice(0, 500))
    }
  }
}

async function createAuthState(baseURL: string) {
  console.log('🔐 Creating auth state for admin user...')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to login page - use domcontentloaded for speed (networkidle waits too long)
    await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })

    // Wait for the login form (waits for React hydration + auth check)
    await page.waitForSelector('input[id="email"]', { timeout: 30000 })

    // Fill in credentials
    await page.fill('input[id="email"]', 'admin@example.com')
    await page.fill('input[id="password"]', 'password')

    // Submit the form and wait for the response
    const [response] = await Promise.all([
      // Wait for the sign-in API request to complete (better-auth uses /api/auth/sign-in/email)
      page.waitForResponse(
        (resp) => resp.url().includes('/api/auth/sign-in'),
        { timeout: 30000 }
      ),
      page.click('button[type="submit"]'),
    ])

    // Check if the sign-in request was successful
    const responseStatus = response.status()
    if (responseStatus !== 200) {
      const responseBody = await response.text().catch(() => 'Unable to read response')
      throw new Error(`Sign-in API returned ${responseStatus}: ${responseBody}`)
    }

    // Wait for navigation after successful login (no artificial delay needed)
    // The app redirects to "/" after login, but might go through setup-organization first
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30000,
    })

    // Save the authenticated state
    await context.storageState({ path: authStatePath })

    console.log('   ✓ Auth state saved to e2e/.auth/admin.json')
  } catch (error) {
    // Take a screenshot for debugging
    const screenshotPath = path.join(__dirname, '.auth/login-failure.png')
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
    console.error(`   📸 Screenshot saved to ${screenshotPath}`)
    console.error('   ✗ Failed to create auth state:', error)
    throw error
  } finally {
    await browser.close()
  }
}

async function createEmptyAuthState() {
  await fs.promises.writeFile(
    authStatePath,
    JSON.stringify({ cookies: [], origins: [] }, null, 2),
    'utf8'
  )
  console.log('   ✓ Empty auth state saved for authless mode')
}

export default globalSetup

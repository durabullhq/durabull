import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')
const envPath = path.join(repoRoot, '.env')

let envLoaded = false

function loadEnvFile(): void {
  if (envLoaded) return
  // Cwd first: when running `bun tooling/scripts/...` from the repo root, this is the real `.env`.
  // Module-relative `repoRoot` can disagree with cwd in some workspace/symlink layouts.
  const cwdEnvPath = path.join(process.cwd(), '.env')
  loadDotenv({ path: cwdEnvPath })
  if (cwdEnvPath !== envPath) {
    loadDotenv({ path: envPath })
  }
  envLoaded = true
}

const emptyToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

const optionalString = z.preprocess(emptyToUndefined, z.string().optional())
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().optional())
const optionalNonNegativeInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().nonnegative().optional()
)
const optionalBoolean = z.preprocess((value) => {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return undefined
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  }
  if (typeof value === 'number') return value === 1
  return value
}, z.boolean().optional())

const nodeEnvSchema = z.preprocess(
  emptyToUndefined,
  z.enum(['development', 'test', 'production']).optional()
)

const appBaseUrlSchema = z.preprocess(
  emptyToUndefined,
  z.string().default('http://localhost:5173')
)

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_BASE_URL: appBaseUrlSchema,
  PORT: optionalInt,
  BETTER_AUTH_SECRET: optionalString,
  DATABASE_URL: optionalString,
  REDIS_URL: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GITHUB_OAUTH_CLIENT_ID: optionalString,
  GITHUB_OAUTH_CLIENT_SECRET: optionalString,
  DISABLE_RATE_LIMIT: optionalBoolean,
  CI: optionalBoolean,
  ASSET_PRELOAD_MAX_SIZE: optionalNonNegativeInt,
  ASSET_PRELOAD_VERBOSE_LOGGING: optionalBoolean,
  VITE_PUBLIC_APP_URL: optionalString,
  POSTHOG_KEY: optionalString,
  POSTHOG_HOST: optionalString,
  DURABULL_TELEMETRY_HMAC_SECRET: optionalString,
  DURABULL_TELEMETRY_POSTHOG_HOST: optionalString,
  DURABULL_TELEMETRY_POSTHOG_KEY: optionalString,
  DURABULL_CLOUD: optionalBoolean,
  DURABULL_AUTHLESS: optionalBoolean,
  DURABULL_ENV_CONNECTIONS: optionalBoolean,
  DURABULL_REDIS_URL_ENCRYPTION_KEY: optionalString,
  DURABULL_REDIS_PORT: optionalInt,
  DURABULL_REDIS_URL_DEFAULT: optionalString,
  DURABULL_DEMO_ACCOUNT_REDIS_CONNECTION_STRING: optionalString,
  DURABULL_ALERT_ENABLED: optionalBoolean,
  DURABULL_ALERT_POLL_INTERVAL_MS: optionalInt,
  DEMO_HEALTH_MAX_AGE_HOURS: optionalNonNegativeInt,
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  loadEnvFile()
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return result.data
}

let cachedEnv: Env | null = null

export function getEnv(options: { refresh?: boolean } = {}): Env {
  if (!cachedEnv || options.refresh) {
    cachedEnv = parseEnv()
  }
  return cachedEnv
}

export const env = getEnv()

export function requireEnv<K extends keyof Env>(key: K, message?: string): NonNullable<Env[K]> {
  const value = env[key]
  if (value === undefined || value === null || value === '') {
    throw new Error(message ?? `${String(key)} is required.`)
  }
  return value as NonNullable<Env[K]>
}

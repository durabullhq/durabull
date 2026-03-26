import { createHash } from 'node:crypto'
import { env } from '@durabull/env'
import { eq } from 'drizzle-orm'
import type { Database } from './client'
import { encryptRedisUrl } from './redis-url-encryption'
import { validateRedisUrlForEnvironment } from './redis-url-validation'
import { redisConnection } from './schemas/redis-connection/schema'
import type { ConnectionEnvironment } from './schemas/redis-connection/schema'

const ENV_PREFIX = 'DURABULL_REDIS_URL_'
const ENV_DEFAULT_KEY = 'DURABULL_REDIS_URL_DEFAULT'
const ENV_ENCRYPTION_KEY = 'DURABULL_REDIS_URL_ENCRYPTION_KEY'
const ENVIRONMENT_SUFFIX = '_ENVIRONMENT'
const ENV_NAMESPACE_UUID = '2a48b9e7-32fa-4d5a-8f61-7e7a2f6c3f0b'

export interface EnvRedisConnection {
  envName: string
  name: string
  url: string
  environment: ConnectionEnvironment
  isDefault: boolean
}

let cachedConnections: EnvRedisConnection[] | null = null
const seededOrganizations = new Set<string>()

export function shouldUseEnvConnections(): boolean {
  return env.DURABULL_ENV_CONNECTIONS === true
}

export function clearEnvConnectionCache(): void {
  cachedConnections = null
}

export function clearSeededEnvConnections(): void {
  seededOrganizations.clear()
}

function toDisplayName(envName: string): string {
  return envName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function parseEnvironment(value: string | undefined): ConnectionEnvironment {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'production' || normalized === 'staging' || normalized === 'development') {
    return normalized
  }
  return 'development'
}

function normalizeDefaultName(value: string | undefined): string | null {
  const normalized = value?.trim().toUpperCase()
  return normalized && normalized.length > 0 ? normalized : null
}

export function getEnvRedisConnections(): EnvRedisConnection[] {
  if (cachedConnections) {
    return cachedConnections
  }

  const connections: EnvRedisConnection[] = []
  const configuredDefaultName = normalizeDefaultName(env.DURABULL_REDIS_URL_DEFAULT)
  const urlPattern = new RegExp(`^${ENV_PREFIX}([A-Z][A-Z0-9_]*)$`)

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(ENV_PREFIX)) continue
    if (key === ENV_DEFAULT_KEY || key === ENV_ENCRYPTION_KEY || key.endsWith(ENVIRONMENT_SUFFIX)) {
      continue
    }

    const match = key.match(urlPattern)
    if (!match) continue

    const url = typeof value === 'string' ? value.trim() : ''
    if (!url) continue

    const urlValidation = validateRedisUrlForEnvironment(url)
    if (!urlValidation.valid) {
      console.warn(
        `[durabull] Skipping invalid env Redis URL in ${key}: ${urlValidation.error ?? 'Invalid URL'}`
      )
      continue
    }

    const envName = match[1]
    const environment = parseEnvironment(process.env[`${key}${ENVIRONMENT_SUFFIX}`])

    connections.push({
      envName,
      name: toDisplayName(envName),
      url,
      environment,
      isDefault: false,
    })
  }

  connections.sort((a, b) => a.envName.localeCompare(b.envName))

  const envNames = new Set(connections.map((conn) => conn.envName))
  let effectiveDefaultName: string | null = configuredDefaultName

  if (configuredDefaultName && !envNames.has(configuredDefaultName)) {
    console.warn(
      `[durabull] DURABULL_REDIS_URL_DEFAULT="${configuredDefaultName}" does not match any configured DURABULL_REDIS_URL_* connection.`
    )
    effectiveDefaultName = null
  }

  if (!effectiveDefaultName && connections[0]) {
    effectiveDefaultName = connections[0].envName
  }

  if (effectiveDefaultName) {
    for (const connection of connections) {
      connection.isDefault = connection.envName === effectiveDefaultName
    }
  }

  cachedConnections = connections
  return connections
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = uuidToBytes(namespace)
  const hash = createHash('sha1')
    .update(Buffer.concat([Buffer.from(namespaceBytes), Buffer.from(name)]))
    .digest()

  const bytes = new Uint8Array(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return bytesToUuid(bytes)
}

export function getEnvRedisConnectionId(organizationId: string, envName: string): string {
  return uuidV5(`${organizationId}:${envName}`, ENV_NAMESPACE_UUID)
}

export function getEnvRedisConnectionIdsForOrganization(organizationId: string): string[] {
  return getEnvRedisConnections().map((connection) =>
    getEnvRedisConnectionId(organizationId, connection.envName)
  )
}

export async function syncEnvConnectionsForOrganization(
  db: Database,
  organizationId: string
): Promise<void> {
  if (!shouldUseEnvConnections()) return
  const connections = getEnvRedisConnections()
  if (connections.length === 0) return
  if (seededOrganizations.has(organizationId)) return

  const envDefault = connections.find((conn) => conn.isDefault) ?? connections[0]
  const defaultId = envDefault ? getEnvRedisConnectionId(organizationId, envDefault.envName) : null

  const now = new Date()
  const shouldForceDefault = Boolean(defaultId)

  if (shouldForceDefault && defaultId) {
    await db
      .update(redisConnection)
      .set({ isDefault: false, updatedAt: now })
      .where(eq(redisConnection.organizationId, organizationId))
  }

  for (const connection of connections) {
    const id = getEnvRedisConnectionId(organizationId, connection.envName)
    const isDefault = shouldForceDefault && defaultId ? id === defaultId : false

    const updateSet: Partial<{
      name: string
      url: string
      environment: ConnectionEnvironment
      isDefault: boolean
      updatedAt: Date
    }> = {
      name: connection.name,
      url: encryptRedisUrl(connection.url),
      environment: connection.environment,
      isDefault,
      updatedAt: now,
    }

    await db
      .insert(redisConnection)
      .values({
        id,
        name: connection.name,
        url: encryptRedisUrl(connection.url),
        environment: connection.environment,
        isDefault,
        organizationId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: redisConnection.id,
        set: updateSet,
      })
  }

  seededOrganizations.add(organizationId)
}

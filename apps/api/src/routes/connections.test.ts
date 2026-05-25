import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  closeDb,
  getDb,
  member,
  organization,
  redisConnectionRepository,
  redisDiscoveredQueueRepository,
  user,
} from '@durabull/dal'
import { env } from '@durabull/env'
import type { User } from 'better-auth/types'
import { Hono } from 'hono'
import { createApiApp } from '../app'
import { resetAuthlessStateForTests } from '../lib/authless'

const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const mutableEnv = env as {
  DATABASE_URL?: string
  DURABULL_AUTHLESS?: boolean
  DURABULL_ENV_CONNECTIONS?: boolean
  DURABULL_REDIS_URL_ENCRYPTION_KEY?: string
}

const originalAuthless = mutableEnv.DURABULL_AUTHLESS
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalEnvConnections = mutableEnv.DURABULL_ENV_CONNECTIONS
const originalEncryptionKey = mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

interface ConnectionResponseBody {
  connection: {
    id: string
    prefix: string
  }
}

interface ConnectionDetailResponseBody {
  connection: {
    id: string
    name: string
    url: string | null
    prefix: string
  }
}

const URL_ACCESS_TEST_ORG_ID = 'connection-url-access-org'
const URL_ACCESS_SECRET = 'redis://:secret-pass@redis.example.com:6379/0'

const URL_ACCESS_USERS = {
  owner: {
    id: 'connection-url-owner',
    name: 'Owner User',
    email: 'owner@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  admin: {
    id: 'connection-url-admin',
    name: 'Admin User',
    email: 'admin@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  member: {
    id: 'connection-url-member',
    name: 'Member User',
    email: 'member@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
} satisfies Record<'owner' | 'admin' | 'member', User>

async function seedUrlAccessFixtures(): Promise<string> {
  const db = await getDb()
  const now = new Date()

  await db.insert(organization).values({
    id: URL_ACCESS_TEST_ORG_ID,
    name: 'Connection URL Access Org',
    slug: 'connection-url-access-org',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(user).values(
    Object.values(URL_ACCESS_USERS).map((accessUser) => ({
      id: accessUser.id,
      name: accessUser.name,
      email: accessUser.email,
      emailVerified: accessUser.emailVerified,
      image: accessUser.image,
      createdAt: now,
      updatedAt: now,
    }))
  )

  await db.insert(member).values([
    {
      id: 'connection-url-owner-member',
      organizationId: URL_ACCESS_TEST_ORG_ID,
      userId: URL_ACCESS_USERS.owner.id,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'connection-url-admin-member',
      organizationId: URL_ACCESS_TEST_ORG_ID,
      userId: URL_ACCESS_USERS.admin.id,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'connection-url-regular-member',
      organizationId: URL_ACCESS_TEST_ORG_ID,
      userId: URL_ACCESS_USERS.member.id,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    },
  ])

  const connection = await redisConnectionRepository.create({
    name: 'Secret Redis',
    url: URL_ACCESS_SECRET,
    environment: 'production',
    isDefault: true,
    prefix: 'bull',
    organizationId: URL_ACCESS_TEST_ORG_ID,
  })

  return connection.id
}

async function createConnectionsRouteApp(requestUser: User | null) {
  const { default: connectionsRoutes } = await import('./connections')
  const app = new Hono()

  app.use('*', async (c, next) => {
    c.set('organizationId', URL_ACCESS_TEST_ORG_ID)
    c.set('user', requestUser)
    await next()
  })

  return app.route('/', connectionsRoutes)
}

describe('connections prefix API', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-connections-prefix-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_AUTHLESS = true
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    resetAuthlessStateForTests()
    await closeDb()
  })

  afterEach(async () => {
    resetAuthlessStateForTests()
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_AUTHLESS = originalAuthless
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnections
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalEncryptionKey

    if (originalPgliteDir) {
      process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    } else {
      delete process.env.DURABULL_PGLITE_DIR
    }

    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it('defaults, stores, updates, and preserves BullMQ prefixes', async () => {
    const { app } = await createApiApp({ enableLogging: false })

    const defaultPrefixResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Default Prefix Redis',
        url: 'redis://localhost:6379/0',
      }),
    })

    expect(defaultPrefixResponse.status).toBe(201)
    const defaultPrefixBody = (await defaultPrefixResponse.json()) as ConnectionResponseBody
    expect(defaultPrefixBody.connection.prefix).toBe('bull')

    const customPrefixResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Custom Prefix Redis',
        url: 'redis://localhost:6379/1',
        prefix: ' tenant-a ',
      }),
    })

    expect(customPrefixResponse.status).toBe(201)
    const customPrefixBody = (await customPrefixResponse.json()) as ConnectionResponseBody
    expect(customPrefixBody.connection.prefix).toBe('tenant-a')

    await redisDiscoveredQueueRepository.upsertConfirmedQueues(
      customPrefixBody.connection.id,
      ['old-prefix-queue'],
      new Date()
    )
    expect(
      await redisDiscoveredQueueRepository.countByConnection(customPrefixBody.connection.id)
    ).toBe(1)

    const updatePrefixResponse = await app.request(
      `/api/connections/${customPrefixBody.connection.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: ' tenant-b ' }),
      }
    )

    expect(updatePrefixResponse.status).toBe(200)
    const updatePrefixBody = (await updatePrefixResponse.json()) as ConnectionResponseBody
    expect(updatePrefixBody.connection.prefix).toBe('tenant-b')
    expect(
      await redisDiscoveredQueueRepository.countByConnection(customPrefixBody.connection.id)
    ).toBe(0)

    const updateNameResponse = await app.request(
      `/api/connections/${customPrefixBody.connection.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed Custom Prefix Redis' }),
      }
    )

    expect(updateNameResponse.status).toBe(200)
    const updateNameBody = (await updateNameResponse.json()) as ConnectionResponseBody
    expect(updateNameBody.connection.prefix).toBe('tenant-b')
  })

  it('rejects blank prefixes', async () => {
    const { app } = await createApiApp({ enableLogging: false })

    const createResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Blank Prefix Redis',
        url: 'redis://localhost:6379/0',
        prefix: '   ',
      }),
    })

    expect(createResponse.status).toBe(400)
  })

  it('clears discovered queues when the connection URL changes', async () => {
    const { app } = await createApiApp({ enableLogging: false })

    const createResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'URL Change Redis',
        url: 'redis://localhost:6379/0',
      }),
    })

    expect(createResponse.status).toBe(201)
    const createBody = (await createResponse.json()) as ConnectionResponseBody

    await redisDiscoveredQueueRepository.upsertConfirmedQueues(
      createBody.connection.id,
      ['old-url-queue'],
      new Date()
    )
    expect(await redisDiscoveredQueueRepository.countByConnection(createBody.connection.id)).toBe(1)

    const updateResponse = await app.request(`/api/connections/${createBody.connection.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'redis://localhost:6379/1' }),
    })

    expect(updateResponse.status).toBe(200)
    expect(await redisDiscoveredQueueRepository.countByConnection(createBody.connection.id)).toBe(0)
  })
})

describe('connections URL access control', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-connections-url-access-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_AUTHLESS = false
    mutableEnv.DURABULL_ENV_CONNECTIONS = false
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    resetAuthlessStateForTests()
    await closeDb()
  })

  afterEach(async () => {
    resetAuthlessStateForTests()
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    mutableEnv.DURABULL_AUTHLESS = originalAuthless
    mutableEnv.DURABULL_ENV_CONNECTIONS = originalEnvConnections
    mutableEnv.DURABULL_REDIS_URL_ENCRYPTION_KEY = originalEncryptionKey

    if (originalPgliteDir) {
      process.env.DURABULL_PGLITE_DIR = originalPgliteDir
    } else {
      delete process.env.DURABULL_PGLITE_DIR
    }

    if (tempPgliteDir) {
      await rm(tempPgliteDir, { recursive: true, force: true })
      tempPgliteDir = ''
    }
  })

  it.each([
    ['owner', URL_ACCESS_USERS.owner],
    ['admin', URL_ACCESS_USERS.admin],
  ] as const)('returns the connection URL for organization %s users', async (_role, requestUser) => {
    const connectionId = await seedUrlAccessFixtures()
    const app = await createConnectionsRouteApp(requestUser)

    const response = await app.request(`/${connectionId}`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as ConnectionDetailResponseBody
    expect(body.connection.url).toBe(URL_ACCESS_SECRET)
  })

  it('returns a null URL for regular organization members', async () => {
    const connectionId = await seedUrlAccessFixtures()
    const app = await createConnectionsRouteApp(URL_ACCESS_USERS.member)

    const response = await app.request(`/${connectionId}`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as ConnectionDetailResponseBody
    expect(body.connection.url).toBeNull()
    expect(body.connection.name).toBe('Secret Redis')
  })

  it('returns a null URL when no authenticated user is present', async () => {
    const connectionId = await seedUrlAccessFixtures()
    const app = await createConnectionsRouteApp(null)

    const response = await app.request(`/${connectionId}`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as ConnectionDetailResponseBody
    expect(body.connection.url).toBeNull()
  })

  it('returns the connection URL for authless owner via the full app', async () => {
    mutableEnv.DURABULL_AUTHLESS = true
    resetAuthlessStateForTests()
    await closeDb()

    const { app } = await createApiApp({ enableLogging: false })

    const createResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Authless Redis',
        url: URL_ACCESS_SECRET,
      }),
    })

    expect(createResponse.status).toBe(201)
    const createBody = (await createResponse.json()) as ConnectionDetailResponseBody

    const detailResponse = await app.request(`/api/connections/${createBody.connection.id}`)
    expect(detailResponse.status).toBe(200)

    const detailBody = (await detailResponse.json()) as ConnectionDetailResponseBody
    expect(detailBody.connection.url).toBe(URL_ACCESS_SECRET)
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, closeDb, eq, getDb, member, organization, user } from '@durabull/dal'
import { env } from '@durabull/env'
import {
  AUTHLESS_ORG_ID,
  AUTHLESS_ORG_SLUG,
  AUTHLESS_USER_ID,
  getAuthlessContext,
  isAuthlessMode,
  resetAuthlessStateForTests,
  withVisibleActor,
} from './authless'

const mutableEnv = env as {
  DURABULL_AUTHLESS?: boolean
  DATABASE_URL?: string
}

const originalAuthlessMode = mutableEnv.DURABULL_AUTHLESS
const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR

let tempPgliteDir = ''

async function resetTestState() {
  resetAuthlessStateForTests()
  await closeDb()
}

describe('authless context', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-authless-test-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    mutableEnv.DURABULL_AUTHLESS = true
    await resetTestState()
  })

  afterEach(async () => {
    await resetTestState()
    mutableEnv.DURABULL_AUTHLESS = originalAuthlessMode
    mutableEnv.DATABASE_URL = originalDatabaseUrl
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

  it('detects authless mode from environment', () => {
    mutableEnv.DURABULL_AUTHLESS = true
    expect(isAuthlessMode()).toBe(true)

    mutableEnv.DURABULL_AUTHLESS = false
    expect(isAuthlessMode()).toBe(false)
  })

  it('creates authless defaults and returns session context', async () => {
    const context = await getAuthlessContext()
    expect(context.user.id).toBe(AUTHLESS_USER_ID)
    expect(context.organization.id).toBe(AUTHLESS_ORG_ID)
    expect(context.organization.slug).toBe(AUTHLESS_ORG_SLUG)
    expect(context.session.userId).toBe(context.user.id)
    expect(context.session.activeOrganizationId).toBe(context.organization.id)

    const db = await getDb()
    const membership = await db
      .select()
      .from(member)
      .where(
        and(eq(member.organizationId, context.organization.id), eq(member.userId, context.user.id))
      )
      .limit(1)
    expect(membership[0]?.role).toBe('owner')
  }, 20_000)

  it('reuses existing records by unique keys and upgrades membership role', async () => {
    const db = await getDb()
    const now = new Date()

    await db.insert(user).values({
      id: 'existing-user',
      name: 'Existing User',
      email: 'admin@localhost',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(organization).values({
      id: 'existing-org',
      name: 'Existing Authless Org',
      slug: AUTHLESS_ORG_SLUG,
      logo: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(member).values({
      id: 'existing-member',
      organizationId: 'existing-org',
      userId: 'existing-user',
      role: 'member',
      createdAt: now,
      updatedAt: now,
    })

    resetAuthlessStateForTests()
    const context = await getAuthlessContext()

    expect(context.user.id).toBe('existing-user')
    expect(context.organization.id).toBe('existing-org')

    const updatedMembership = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, 'existing-org'), eq(member.userId, 'existing-user')))
      .limit(1)
    expect(updatedMembership[0]?.role).toBe('owner')

    const preferredUser = await db.select().from(user).where(eq(user.id, AUTHLESS_USER_ID)).limit(1)
    expect(preferredUser).toHaveLength(0)

    const preferredOrg = await db
      .select()
      .from(organization)
      .where(eq(organization.id, AUTHLESS_ORG_ID))
      .limit(1)
    expect(preferredOrg).toHaveLength(0)
  }, 20_000)
})

describe('withVisibleActor', () => {
  afterEach(() => {
    mutableEnv.DURABULL_AUTHLESS = originalAuthlessMode
  })

  it('drops the synthetic acknowledger in installs without accounts', () => {
    mutableEnv.DURABULL_AUTHLESS = true
    const event: { id: string; acknowledgedByName: string | null } = {
      id: 'e1',
      acknowledgedByName: 'Local user',
    }
    expect(withVisibleActor(event)).toEqual({
      id: 'e1',
      acknowledgedByName: null,
    })
  })

  it('keeps real names when accounts exist', () => {
    mutableEnv.DURABULL_AUTHLESS = false
    expect(withVisibleActor({ id: 'e1', acknowledgedByName: 'Sam Operator' })).toEqual({
      id: 'e1',
      acknowledgedByName: 'Sam Operator',
    })
  })

  it('leaves events without an acknowledger field untouched', () => {
    mutableEnv.DURABULL_AUTHLESS = true
    const event = { id: 'e1' }
    expect(withVisibleActor(event)).toBe(event)
  })
})

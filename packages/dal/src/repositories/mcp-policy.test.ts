import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '@durabull/env'

import { closeDb, getDb } from '../db/client'
import { mcpServiceAccount, organization } from '../db/schemas'
import { mcpPolicyRepository } from './mcp-policy'

const mutableEnv = env as {
  DATABASE_URL?: string
}

const originalDatabaseUrl = mutableEnv.DATABASE_URL
const originalProcessDatabaseUrl = process.env.DATABASE_URL
const originalPgliteDir = process.env.DURABULL_PGLITE_DIR
let tempPgliteDir = ''

describe('mcpPolicyRepository', () => {
  beforeEach(async () => {
    tempPgliteDir = await mkdtemp(join(tmpdir(), 'durabull-mcp-policy-'))
    process.env.DURABULL_PGLITE_DIR = tempPgliteDir
    delete process.env.DATABASE_URL
    mutableEnv.DATABASE_URL = undefined
    await closeDb()
  })

  afterEach(async () => {
    await closeDb()
    mutableEnv.DATABASE_URL = originalDatabaseUrl
    if (originalProcessDatabaseUrl) {
      process.env.DATABASE_URL = originalProcessDatabaseUrl
    } else {
      delete process.env.DATABASE_URL
    }

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

  it('issues and verifies hashed service-account secrets', async () => {
    const db = await getDb()
    const now = new Date()
    const orgId = 'mcp-policy-org'
    await db.insert(organization).values({
      id: orgId,
      name: 'MCP Policy Org',
      slug: 'mcp-policy-org',
      createdAt: now,
      updatedAt: now,
    })

    const [serviceAccount] = await db
      .insert(mcpServiceAccount)
      .values({
        organizationId: orgId,
        name: 'automation-sa',
        disabled: false,
      })
      .returning()

    const { secret, record } = await mcpPolicyRepository.issueServiceAccountSecret(
      serviceAccount.id,
      {
        label: 'initial',
      }
    )

    expect(secret.startsWith('dbsa_')).toBe(true)
    expect(record.secretHash.includes(secret)).toBe(false)
    expect(await mcpPolicyRepository.verifyServiceAccountSecret(serviceAccount.id, secret)).toBe(
      true
    )
    expect(
      await mcpPolicyRepository.verifyServiceAccountSecret(serviceAccount.id, 'dbsa_invalid')
    ).toBe(false)
  })

  it('rotates service-account secrets and revokes previous active ones', async () => {
    const db = await getDb()
    const now = new Date()
    const orgId = 'mcp-policy-org-rotate'
    await db.insert(organization).values({
      id: orgId,
      name: 'MCP Policy Org Rotate',
      slug: 'mcp-policy-org-rotate',
      createdAt: now,
      updatedAt: now,
    })

    const [serviceAccount] = await db
      .insert(mcpServiceAccount)
      .values({
        organizationId: orgId,
        name: 'rotation-sa',
        disabled: false,
      })
      .returning()

    const initial = await mcpPolicyRepository.issueServiceAccountSecret(serviceAccount.id, {
      label: 'initial',
    })
    const rotated = await mcpPolicyRepository.rotateServiceAccountSecret(serviceAccount.id, {
      label: 'rotated',
    })

    expect(
      await mcpPolicyRepository.verifyServiceAccountSecret(serviceAccount.id, initial.secret)
    ).toBe(false)
    expect(
      await mcpPolicyRepository.verifyServiceAccountSecret(serviceAccount.id, rotated.secret)
    ).toBe(true)
  })
})

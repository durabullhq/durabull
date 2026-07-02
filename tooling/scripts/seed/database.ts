/**
 * Database Seeding
 *
 * Seeds PostgreSQL with users, organizations, memberships,
 * Redis connections, and pending invitations.
 */

import {
  alertRule,
  and,
  authSchema,
  encryptRedisUrl,
  eq,
  getDb,
  invitation,
  member,
  organization,
  redisConnection,
  user,
} from '@durabull/dal'
import { uuidv7 } from '@durabull/utils/uuid'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import {
  USERS,
  ORGANIZATIONS,
  CONNECTIONS,
  PENDING_INVITATIONS,
  PRIMARY_TEST_CONNECTION,
  REDIS_URL,
} from './config'
import { logSection, logItem, logSuccess, logWarning } from './utils'

// ============================================================================
// Password Hashing
// ============================================================================

async function hashPassword(password: string): Promise<string> {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  })
  return `${salt}:${bytesToHex(key)}`
}

// ============================================================================
// User Seeding
// ============================================================================

// Map to store actual user IDs (email -> id) for use in memberships
const userIdMap: Map<string, string> = new Map()

async function seedUsers(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  logSection('Seeding Users')
  const now = new Date()

  for (const [key, userData] of Object.entries(USERS)) {
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, userData.email))
      .limit(1)

    if (existing.length > 0) {
      // Store the actual ID from the database
      userIdMap.set(userData.email, existing[0].id)
      logWarning(`User ${userData.email} already exists`)
      continue
    }

    logItem(`Creating user: ${userData.name} (${userData.email})...`)

    await db.insert(user).values({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })

    // Store the new ID
    userIdMap.set(userData.email, userData.id)

    const passwordHash = await hashPassword(userData.password)
    await db.insert(authSchema.authAccount).values({
      id: uuidv7(),
      accountId: userData.id,
      providerId: 'credential',
      userId: userData.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })

    logSuccess(`Created user: ${userData.name}`)
  }
}

/**
 * Get the actual user ID from the database (handles existing users with different IDs)
 */
function getActualUserId(configUserId: string): string {
  // Find which user config this ID belongs to
  for (const userData of Object.values(USERS)) {
    if (userData.id === configUserId) {
      return userIdMap.get(userData.email) || configUserId
    }
  }
  return configUserId
}

// ============================================================================
// Organization Seeding
// ============================================================================

// Map to store actual organization IDs (slug -> id) for use in connections/invitations
const orgIdMap: Map<string, string> = new Map()

interface MembershipConfig {
  userId: string
  role: 'owner' | 'admin' | 'member'
}

const ORG_MEMBERSHIPS: Record<string, MembershipConfig[]> = {
  acme: [
    { userId: USERS.admin.id, role: 'owner' },
    { userId: USERS.developer.id, role: 'member' },
    { userId: USERS.lead.id, role: 'admin' },
  ],
  techstart: [
    { userId: USERS.admin.id, role: 'owner' },
    { userId: USERS.developer.id, role: 'member' },
  ],
  personal: [
    { userId: USERS.admin.id, role: 'owner' },
  ],
}

async function seedOrganizations(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  logSection('Seeding Organizations')
  const now = new Date()

  for (const [key, orgData] of Object.entries(ORGANIZATIONS)) {
    const existing = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgData.slug))
      .limit(1)

    if (existing.length > 0) {
      // Store the actual ID from the database
      orgIdMap.set(orgData.slug, existing[0].id)
      logWarning(`Organization ${orgData.name} already exists`)
      continue
    }

    logItem(`Creating organization: ${orgData.name}...`)

    await db.insert(organization).values({
      id: orgData.id,
      name: orgData.name,
      slug: orgData.slug,
      createdAt: now,
      updatedAt: now,
    })

    // Store the new ID
    orgIdMap.set(orgData.slug, orgData.id)

    // Add memberships for this organization
    const memberships = ORG_MEMBERSHIPS[key] || []
    for (const membership of memberships) {
      const actualUserId = getActualUserId(membership.userId)
      await db.insert(member).values({
        id: uuidv7(),
        organizationId: orgData.id,
        userId: actualUserId,
        role: membership.role,
        createdAt: now,
        updatedAt: now,
      })
    }

    logSuccess(`Created organization: ${orgData.name} with ${memberships.length} members`)
  }
}

/**
 * Get the actual organization ID from the database (handles existing orgs with different IDs)
 */
function getActualOrgId(configOrgId: string): string {
  // Find which org config this ID belongs to
  for (const orgData of Object.values(ORGANIZATIONS)) {
    if (orgData.id === configOrgId) {
      return orgIdMap.get(orgData.slug) || configOrgId
    }
  }
  return configOrgId
}

// ============================================================================
// Redis Connection Seeding
// ============================================================================

async function seedConnections(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  logSection('Seeding Redis Connections')
  const now = new Date()

  for (const conn of CONNECTIONS) {
    // Check if connection exists by ID or by name within the org
    const actualOrgId = getActualOrgId(conn.organizationId)
    
    const existingById = await db
      .select({ id: redisConnection.id })
      .from(redisConnection)
      .where(eq(redisConnection.id, conn.id))
      .limit(1)

    if (existingById.length > 0) {
      logItem(`Updating connection: ${conn.name}...`)
      await db
        .update(redisConnection)
        .set({ url: encryptRedisUrl(REDIS_URL), updatedAt: now })
        .where(eq(redisConnection.id, conn.id))
      logSuccess(`Updated connection: ${conn.name}`)
    } else {
      // Check if a connection with this name already exists for this org
      const existingByName = await db
        .select({ id: redisConnection.id })
        .from(redisConnection)
        .where(
          and(
            eq(redisConnection.name, conn.name),
            eq(redisConnection.organizationId, actualOrgId)
          )
        )
        .limit(1)

      if (existingByName.length > 0) {
        logItem(`Updating connection by name: ${conn.name}...`)
        await db
          .update(redisConnection)
          .set({
            url: encryptRedisUrl(REDIS_URL),
            environment: conn.environment,
            isDefault: conn.isDefault,
            updatedAt: now,
          })
          .where(eq(redisConnection.id, existingByName[0].id))
        logSuccess(`Updated existing connection: ${conn.name}`)
        continue
      }

      logItem(`Creating connection: ${conn.name} (${conn.environment})...`)
      await db.insert(redisConnection).values({
        id: conn.id,
        name: conn.name,
        url: encryptRedisUrl(REDIS_URL),
        isDefault: conn.isDefault,
        environment: conn.environment,
        organizationId: actualOrgId,
        createdAt: now,
        updatedAt: now,
      })
      logSuccess(`Created connection: ${conn.name}`)
    }
  }
}

// ============================================================================
// Alert Rule Seeding
// ============================================================================

/**
 * Seed a couple of enabled alert rules on the primary test connection so the
 * alerting UI (incident history, job auto-resolve, bulk resolve) has data to
 * show as soon as jobs fail — either from the static seeded jobs or from
 * `bun run workload:dev` / `dev:demo` generating live failures. No
 * notification channels are configured since email/Linear aren't available
 * in local dev by default.
 */
async function seedAlertRules(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  logSection('Seeding Alert Rules')
  const now = new Date()
  const connectionId = PRIMARY_TEST_CONNECTION.id
  const organizationId = getActualOrgId(PRIMARY_TEST_CONNECTION.organizationId)

  const rules = [
    {
      id: '01900000-0000-7000-8000-000000000030',
      name: 'Any job failure',
      type: 'job_failed' as const,
      queueName: null,
      config: {},
    },
    {
      id: '01900000-0000-7000-8000-000000000031',
      name: 'Failure spike',
      type: 'failure_threshold' as const,
      queueName: null,
      config: { count: 5, windowMinutes: 5 },
    },
  ]

  for (const rule of rules) {
    const existing = await db
      .select({ id: alertRule.id })
      .from(alertRule)
      .where(eq(alertRule.id, rule.id))
      .limit(1)

    if (existing.length > 0) {
      logWarning(`Alert rule "${rule.name}" already exists`)
      continue
    }

    logItem(`Creating alert rule: ${rule.name}...`)
    await db.insert(alertRule).values({
      id: rule.id,
      organizationId,
      connectionId,
      queueName: rule.queueName,
      name: rule.name,
      type: rule.type,
      config: rule.config,
      enabled: true,
      notificationChannels: [],
      cooldownMinutes: 5,
      createdAt: now,
      updatedAt: now,
    })
    logSuccess(`Created alert rule: ${rule.name}`)
  }
}

// ============================================================================
// Invitation Seeding
// ============================================================================

async function seedInvitations(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  logSection('Seeding Pending Invitations')
  const now = new Date()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

  for (const inv of PENDING_INVITATIONS) {
    // Check if invitation already exists
    const existing = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.email, inv.email))
      .limit(1)

    if (existing.length > 0) {
      logWarning(`Invitation for ${inv.email} already exists`)
      continue
    }

    const actualOrgId = getActualOrgId(inv.organizationId)
    const actualInviterId = getActualUserId(inv.inviterId)

    logItem(`Creating invitation for: ${inv.email} (${inv.role})...`)

    await db.insert(invitation).values({
      id: uuidv7(),
      organizationId: actualOrgId,
      email: inv.email,
      role: inv.role,
      status: 'pending',
      expiresAt,
      inviterId: actualInviterId,
      createdAt: now,
      updatedAt: now,
    })

    logSuccess(`Created invitation for: ${inv.email}`)
  }
}

// ============================================================================
// Main Export
// ============================================================================

export async function seedDatabase(): Promise<void> {
  logSection('Seeding PostgreSQL Database')
  const db = await getDb()

  await seedUsers(db)
  await seedOrganizations(db)
  await seedConnections(db)
  await seedAlertRules(db)
  await seedInvitations(db)

  logSuccess('Database seeding complete')
}

import { and, eq, getDb, isOwnerRole, member, organization, user } from '@durabull/dal'
import { env } from '@durabull/env'
import type { Session, User } from 'better-auth/types'

export const AUTHLESS_USER_ID = 'authless-user'
export const AUTHLESS_ORG_ID = 'authless-org'
export const AUTHLESS_MEMBER_ID = 'authless-member'
export const AUTHLESS_ORG_SLUG = 'authless'
export const AUTHLESS_ORG_NAME = 'Authless'
const AUTHLESS_EMAIL = 'admin@localhost'

export const AUTHLESS_USER_TEMPLATE: User = {
  id: AUTHLESS_USER_ID,
  name: 'Local user',
  email: AUTHLESS_EMAIL,
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

interface AuthlessResolvedOrganization {
  id: string
  name: string
  slug: string
}

interface AuthlessResolvedContext {
  user: User
  organization: AuthlessResolvedOrganization
}

export function isAuthlessMode(): boolean {
  return env.DURABULL_AUTHLESS === true
}

/**
 * Installs without accounts (the desktop app, single-user self-hosting) record
 * every action against one synthetic user. Crediting that user ("acknowledged
 * by Local user") is noise, so API responses drop the name in this mode.
 */
export function withVisibleActor<T extends object>(event: T): T {
  if (!isAuthlessMode() || !('acknowledgedByName' in event)) return event
  return { ...event, acknowledgedByName: null }
}

let authlessInitialized = false
let cachedAuthlessContext: AuthlessResolvedContext | null = null
let authlessInitializationPromise: Promise<AuthlessResolvedContext> | null = null

function buildAuthlessSession(
  userId: string,
  activeOrganizationId: string
): Session & { activeOrganizationId: string } {
  const now = new Date()
  return {
    id: 'authless-session',
    userId,
    token: 'authless',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    ipAddress: null,
    userAgent: 'authless',
    createdAt: now,
    updatedAt: now,
    activeOrganizationId,
  }
}

function buildAuthlessMemberId(organizationId: string, userId: string): string {
  return `${AUTHLESS_MEMBER_ID}-${organizationId}-${userId}`
}

async function resolveAuthlessUser(db: Awaited<ReturnType<typeof getDb>>): Promise<User> {
  const byId = await db.select().from(user).where(eq(user.id, AUTHLESS_USER_ID)).limit(1)
  if (byId[0]) {
    return {
      ...byId[0],
      image: byId[0].image ?? null,
    }
  }

  const byEmail = await db.select().from(user).where(eq(user.email, AUTHLESS_EMAIL)).limit(1)
  if (byEmail[0]) {
    return {
      ...byEmail[0],
      image: byEmail[0].image ?? null,
    }
  }

  const createdAt = new Date()
  await db.insert(user).values({
    id: AUTHLESS_USER_ID,
    name: AUTHLESS_USER_TEMPLATE.name,
    email: AUTHLESS_EMAIL,
    emailVerified: true,
    image: null,
    createdAt,
    updatedAt: createdAt,
  })

  const created = await db.select().from(user).where(eq(user.id, AUTHLESS_USER_ID)).limit(1)
  if (!created[0]) {
    throw new Error('Failed to initialize authless user.')
  }

  return {
    ...created[0],
    image: created[0].image ?? null,
  }
}

async function resolveAuthlessOrganization(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<AuthlessResolvedOrganization> {
  const byId = await db
    .select()
    .from(organization)
    .where(eq(organization.id, AUTHLESS_ORG_ID))
    .limit(1)
  if (byId[0]) {
    return {
      id: byId[0].id,
      name: byId[0].name,
      slug: byId[0].slug,
    }
  }

  const bySlug = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, AUTHLESS_ORG_SLUG))
    .limit(1)
  if (bySlug[0]) {
    return {
      id: bySlug[0].id,
      name: bySlug[0].name,
      slug: bySlug[0].slug,
    }
  }

  await db.insert(organization).values({
    id: AUTHLESS_ORG_ID,
    name: AUTHLESS_ORG_NAME,
    slug: AUTHLESS_ORG_SLUG,
    logo: null,
    metadata: null,
  })

  const created = await db
    .select()
    .from(organization)
    .where(eq(organization.id, AUTHLESS_ORG_ID))
    .limit(1)
  if (!created[0]) {
    throw new Error('Failed to initialize authless organization.')
  }

  return {
    id: created[0].id,
    name: created[0].name,
    slug: created[0].slug,
  }
}

async function ensureOwnerMembership(
  db: Awaited<ReturnType<typeof getDb>>,
  organizationId: string,
  userId: string
): Promise<void> {
  const existingMembership = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1)

  if (existingMembership[0]) {
    if (!isOwnerRole(existingMembership[0].role)) {
      await db
        .update(member)
        .set({ role: 'owner', updatedAt: new Date() })
        .where(eq(member.id, existingMembership[0].id))
    }
    return
  }

  await db
    .insert(member)
    .values({
      id: buildAuthlessMemberId(organizationId, userId),
      organizationId,
      userId,
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()

  const createdMembership = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1)

  if (!createdMembership[0]) {
    throw new Error('Failed to initialize authless owner membership.')
  }

  if (!isOwnerRole(createdMembership[0].role)) {
    await db
      .update(member)
      .set({ role: 'owner', updatedAt: new Date() })
      .where(eq(member.id, createdMembership[0].id))
  }
}

async function initializeAuthlessDefaults(): Promise<AuthlessResolvedContext> {
  const db = await getDb()
  const resolvedUser = await resolveAuthlessUser(db)
  const resolvedOrganization = await resolveAuthlessOrganization(db)
  await ensureOwnerMembership(db, resolvedOrganization.id, resolvedUser.id)

  return {
    user: resolvedUser,
    organization: resolvedOrganization,
  }
}

export function resetAuthlessStateForTests() {
  authlessInitialized = false
  cachedAuthlessContext = null
  authlessInitializationPromise = null
}

export async function ensureAuthlessDefaults() {
  if (!isAuthlessMode()) return
  if (authlessInitialized && cachedAuthlessContext) return

  if (!authlessInitializationPromise) {
    authlessInitializationPromise = initializeAuthlessDefaults()
      .then((context) => {
        cachedAuthlessContext = context
        authlessInitialized = true
        return context
      })
      .finally(() => {
        authlessInitializationPromise = null
      })
  }

  await authlessInitializationPromise
}

export async function getAuthlessContext() {
  await ensureAuthlessDefaults()

  const context = cachedAuthlessContext ?? {
    user: AUTHLESS_USER_TEMPLATE,
    organization: {
      id: AUTHLESS_ORG_ID,
      name: AUTHLESS_ORG_NAME,
      slug: AUTHLESS_ORG_SLUG,
    },
  }

  return {
    user: context.user,
    session: buildAuthlessSession(context.user.id, context.organization.id),
    organization: context.organization,
  }
}

export const AUTHLESS_USER = AUTHLESS_USER_TEMPLATE
export const AUTHLESS_SESSION = buildAuthlessSession(AUTHLESS_USER_ID, AUTHLESS_ORG_ID)

export async function getResolvedAuthlessContextForTests(): Promise<AuthlessResolvedContext> {
  await ensureAuthlessDefaults()
  if (!cachedAuthlessContext) {
    throw new Error('Authless context has not been initialized.')
  }
  return cachedAuthlessContext
}

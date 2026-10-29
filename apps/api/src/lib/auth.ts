import { createAuth } from '@durabull/auth'
import { createInvitationEmailSender, isEmailConfigured } from '@durabull/email'
import { env } from '@durabull/env'
import { createBillingOrganizationPolicy } from '../billing/auth-policy'

let authInstance: Awaited<ReturnType<typeof createAuth>> | null = null

/**
 * Get or create the auth instance (singleton pattern).
 * This ensures we only create one Better Auth instance per server.
 */
export async function getAuth() {
  if (!authInstance) {
    // Create email sender if configured
    const sendInvitationEmail = isEmailConfigured()
      ? createInvitationEmailSender({ baseUrl: env.APP_BASE_URL })
      : undefined

    authInstance = await createAuth({
      baseURL: env.APP_BASE_URL,
      trustedOrigins: ['http://localhost:3000', 'http://localhost:3001', env.APP_BASE_URL],
      sendInvitationEmail,
      organizationPolicy: createBillingOrganizationPolicy(),
    })
  }
  return authInstance
}

// Re-export types for convenience
export type { Auth, Session, User } from '@durabull/auth'

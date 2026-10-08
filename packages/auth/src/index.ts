import {
  authSchema,
  eq,
  getDb,
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  organizationSchema,
  user,
  type NewOauthAccessToken,
} from '@durabull/dal'
import { env } from '@durabull/env'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { mcp, organization } from 'better-auth/plugins'
import {
  getCanonicalMcpResourceUri,
  MCP_ALL_SCOPES,
  MCP_OAUTH_SCOPES_SUPPORTED,
  normalizeResourceUri,
} from '@durabull/mcp/auth'
import { MCP_OAUTH_CONSENT_PATH } from './mcp-consent'

const isProduction = env.NODE_ENV === 'production'

/**
 * Check if an error is the expected stale session error.
 * This occurs when setSessionCookie is called with a null session,
 * typically during organization switching with expired/stale sessions.
 */
function isStaleSessionError(error: unknown): boolean {
  return error instanceof TypeError && String(error).includes('session.session.token')
}

/**
 * Custom logger configuration to filter out expected errors in development.
 * In production, all errors are logged for observability.
 */
const customLogger = {
  level: 'error' as const,
  log: (level: string, message: string, ...args: unknown[]) => {
    // Filter out stale session errors in development
    if (!isProduction) {
      const messageStr = String(message)
      const argsStr = args.map(String).join(' ')
      const fullMessage = `${messageStr} ${argsStr}`

      if (fullMessage.includes('session.session.token')) {
        return // Suppress this expected error in development
      }
    }

    // Log errors normally
    console.log(`[Better Auth] ${level}:`, message, ...args)
  },
}

/**
 * Custom error handler to suppress expected errors in development.
 * In production, errors are logged for observability.
 */
const onAPIError = {
  onError: (error: unknown) => {
    // Suppress stale session errors in development
    if (!isProduction && isStaleSessionError(error)) {
      return // Don't log in development
    }

    // Log all errors in production, or unexpected errors in development
    console.error('[Better Auth] API Error:', error)
  },
}

/**
 * Data passed to the sendInvitationEmail callback by better-auth's organization plugin.
 * This matches the type expected by the plugin.
 */
export interface InvitationEmailData {
  id: string
  email: string
  role: string
  organization: {
    id: string
    name: string
    slug: string
    createdAt: Date
    logo?: string | null
    metadata?: unknown
  }
  invitation: {
    id: string
    organizationId: string
    email: string
    role: string
    status: string
    expiresAt: Date
    inviterId: string
    teamId?: string | null
  }
  inviter: {
    id: string
    userId: string
    organizationId: string
    role: string
    createdAt: Date
    user: {
      id: string
      name: string
      email: string
      image?: string | null
    }
  }
}

/**
 * Options for creating the auth instance.
 */
export interface CreateAuthOptions {
  /** Base URL for the auth server (e.g., http://localhost:3001) */
  baseURL?: string
  /** Trusted origins for CORS */
  trustedOrigins?: string[]
  /** Callback to send invitation emails when a user is invited to an organization */
  sendInvitationEmail?: (data: InvitationEmailData, request?: Request) => Promise<void>
}

/**
 * Create and configure the Better Auth instance
 * Supports:
 * - Email/Password authentication
 * - Google OAuth
 * - GitHub OAuth
 * - Organization management
 */
export async function createAuth(options?: CreateAuthOptions) {
  const db = await getDb()

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: user,
        session: authSchema.authSession,
        account: authSchema.authAccount,
        verification: authSchema.authVerification,
        organization: organizationSchema.organization,
        member: organizationSchema.member,
        invitation: organizationSchema.invitation,
        oauthApplication,
        oauthAccessToken,
        oauthConsent,
      },
    }),
    logger: customLogger,
    onAPIError,
    baseURL: options?.baseURL,
    trustedOrigins: options?.trustedOrigins ?? [env.APP_BASE_URL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Set to true in production with email service
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
        allowDifferentEmails: true, // Allow linking accounts with different emails
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        disableImplicitSignUp: true, // Prevents auto-creating new users, requires explicit sign-up or linking
      },
      github: {
        clientId: env.GITHUB_OAUTH_CLIENT_ID ?? '',
        clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
        disableImplicitSignUp: true, // Prevents auto-creating new users, requires explicit sign-up or linking
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              await db
                .update(user)
                .set({ lastSignInAt: new Date() })
                .where(eq(user.id, session.userId))
            } catch (error) {
              console.error('[Better Auth] Failed to update last_sign_in_at:', error)
            }
          },
        },
      },
      oauthAccessToken: {
        create: {
          before: async (token: NewOauthAccessToken) => {
            const canonicalResource = getCanonicalMcpResourceUri(
              options?.baseURL ?? env.APP_BASE_URL
            )
            const normalizedResource = normalizeResourceUri(token.resource ?? canonicalResource)
            return {
              data: {
                ...token,
                resource: normalizedResource,
              },
            }
          },
          after: async (token: { id: string; resource: string | null }) => {
            const canonicalResource = normalizeResourceUri(
              getCanonicalMcpResourceUri(
                options?.baseURL ?? env.APP_BASE_URL
              )
            )

            // Better Auth may occasionally persist null `resource` on MCP tokens; patch only that case.
            if (typeof token.resource === 'string' && token.resource.trim().length > 0) {
              return
            }

            try {
              await db
                .update(oauthAccessToken)
                .set({ resource: canonicalResource, updatedAt: new Date() })
                .where(eq(oauthAccessToken.id, token.id))
            } catch (error) {
              console.error('[Better Auth] Failed to set MCP resource on access token:', error)
            }
          },
        },
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        ...(options?.sendInvitationEmail && {
          sendInvitationEmail: options.sendInvitationEmail,
        }),
      }),
      mcp({
        loginPage: '/login',
        resource: getCanonicalMcpResourceUri(options?.baseURL ?? env.APP_BASE_URL),
        oidcConfig: {
          loginPage: '/login',
          consentPage: MCP_OAUTH_CONSENT_PATH,
          scopes: [...MCP_ALL_SCOPES],
          metadata: {
            scopes_supported: [...MCP_OAUTH_SCOPES_SUPPORTED],
          },
        },
      }),
    ],
  })
}

export type Auth = Awaited<ReturnType<typeof createAuth>>

// Re-export types from better-auth for convenience
export type { Session, User } from 'better-auth/types'

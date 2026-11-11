import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AuthMethod } from '@durabull/analytics/events'
import {
  buildMcpAuthorizeResumeUrl,
  hasMcpAuthorizeQuery,
  isSafeAppRedirectPath,
  resolveSafeAppRedirectPath,
} from '@durabull/auth/client'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  AuthDivider,
  AuthError,
  AuthField,
  AuthHeader,
  AuthLayout,
  AuthLoading,
  authLinkClassName,
  SocialAuthButtons,
} from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAuthErrorMessage, useAuth } from '@/hooks/use-auth'

interface LoginSearch {
  invitationId?: string
  redirect?: string
}

function parseLoginSearch(search: Record<string, unknown>): LoginSearch {
  const redirectRaw =
    typeof search.redirect === 'string' &&
    search.redirect.length > 0 &&
    isSafeAppRedirectPath(search.redirect)
      ? search.redirect
      : undefined

  return {
    invitationId:
      typeof search.invitationId === 'string' && search.invitationId.length > 0
        ? search.invitationId
        : undefined,
    redirect: redirectRaw,
  }
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => parseLoginSearch(search),
  component: LoginPage,
})

function LoginPage() {
  const { invitationId, redirect } = Route.useSearch()
  const navigate = useNavigate()
  const { signIn, isAuthenticated, isLoading: sessionLoading, refetch } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const invitationPath = invitationId ? `/invite/${invitationId}` : null

  const getPostAuthCallbackURL = (): string | undefined => {
    if (typeof window === 'undefined') {
      return undefined
    }

    if (redirect) {
      return `${window.location.origin}${redirect}`
    }

    const urlParams = Object.fromEntries(new URLSearchParams(window.location.search).entries())
    const mcpAuthorizeUrl = buildMcpAuthorizeResumeUrl(urlParams)
    if (mcpAuthorizeUrl) {
      return `${window.location.origin}${mcpAuthorizeUrl}`
    }

    if (invitationPath) {
      return `${window.location.origin}${invitationPath}`
    }

    return undefined
  }

  const navigateAfterAuth = () => {
    if (typeof window === 'undefined') {
      return
    }

    const safeRedirect = redirect
      ? resolveSafeAppRedirectPath(redirect, window.location.origin)
      : undefined
    if (safeRedirect) {
      window.location.assign(safeRedirect)
      return
    }

    const urlParams =
      typeof window !== 'undefined'
        ? Object.fromEntries(new URLSearchParams(window.location.search).entries())
        : {}
    const mcpAuthorizeUrl = buildMcpAuthorizeResumeUrl(urlParams)
    if (mcpAuthorizeUrl) {
      window.location.assign(mcpAuthorizeUrl)
      return
    }

    if (invitationId) {
      navigate({ to: '/invite/$invitationId', params: { invitationId } })
      return
    }
    navigate({ to: '/' })
  }

  useEffect(() => {
    if (!sessionLoading && isAuthenticated) {
      navigateAfterAuth()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once when session becomes authenticated
  }, [isAuthenticated, sessionLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const result = await signIn.email({
        email: formData.email,
        password: formData.password,
      })

      if (result.error) {
        trackEvent(AnalyticsEvents.USER_SIGNED_IN, {
          auth_method: AuthMethod.EMAIL,
          success: false,
        })
        setError(getAuthErrorMessage(result, 'Invalid email or password'))
        setIsLoading(false)
        return
      }

      trackEvent(AnalyticsEvents.USER_SIGNED_IN, {
        auth_method: AuthMethod.EMAIL,
        success: true,
      })

      await refetch()
      navigateAfterAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in. Please try again.')
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)

    trackEvent(AnalyticsEvents.USER_SIGNED_IN, {
      auth_method: AuthMethod.GOOGLE,
      success: true,
    })

    const callbackURL = getPostAuthCallbackURL()
    const authorizeParams =
      typeof window !== 'undefined'
        ? Object.fromEntries(new URLSearchParams(window.location.search).entries())
        : {}
    const preserveMcpAuthorize = hasMcpAuthorizeQuery(authorizeParams)

    try {
      const result = await signIn.social({
        provider: 'google',
        ...(callbackURL
          ? {
              callbackURL,
              newUserCallbackURL: callbackURL,
            }
          : {}),
        ...(invitationId || preserveMcpAuthorize
          ? {
              requestSignUp: true,
            }
          : {}),
      })

      if (result?.error) {
        const errorMessage = getAuthErrorMessage(result, 'Failed to sign in with Google')

        if (errorMessage === 'ACCOUNT_EXISTS') {
          navigate({ to: '/auth-error', search: { reason: 'account-exists', provider: 'google' } })
          return
        }

        setError(errorMessage)
        setIsLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google')
      setIsLoading(false)
    }
  }

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setError(null)

    trackEvent(AnalyticsEvents.USER_SIGNED_IN, {
      auth_method: AuthMethod.GITHUB,
      success: true,
    })

    const callbackURL = getPostAuthCallbackURL()

    const authorizeParams =
      typeof window !== 'undefined'
        ? Object.fromEntries(new URLSearchParams(window.location.search).entries())
        : {}
    const preserveMcpAuthorize = hasMcpAuthorizeQuery(authorizeParams)

    try {
      const result = await signIn.social({
        provider: 'github',
        ...(callbackURL
          ? {
              callbackURL,
              newUserCallbackURL: callbackURL,
            }
          : {}),
        ...(invitationId || preserveMcpAuthorize
          ? {
              requestSignUp: true,
            }
          : {}),
      })

      if (result?.error) {
        const errorMessage = getAuthErrorMessage(result, 'Failed to sign in with GitHub')

        if (errorMessage === 'ACCOUNT_EXISTS') {
          navigate({ to: '/auth-error', search: { reason: 'account-exists', provider: 'github' } })
          return
        }

        setError(errorMessage)
        setIsLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with GitHub')
      setIsLoading(false)
    }
  }

  if (sessionLoading || isAuthenticated) {
    return <AuthLoading />
  }

  // Say why the user is being asked to sign in when they arrived mid-flow.
  const context = invitationId
    ? 'Sign in to accept your invitation.'
    : redirect?.startsWith('/consent')
      ? 'Sign in to review an access request.'
      : undefined

  return (
    <AuthLayout
      footer={
        <>
          Don't have an account?{' '}
          {invitationId ? (
            <Link to="/signup" search={{ invitationId }} className={authLinkClassName}>
              Sign up
            </Link>
          ) : (
            <Link to="/signup" className={authLinkClassName}>
              Sign up
            </Link>
          )}
        </>
      }
    >
      <AuthHeader title="Sign in to Durabull" description={context} />

      <SocialAuthButtons
        disabled={isLoading}
        onSelect={(provider) =>
          provider === 'google' ? void handleGoogleSignIn() : void handleGitHubSignIn()
        }
      />

      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
        <AuthField id="email" label="Email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-9"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={isLoading}
          />
        </AuthField>

        <AuthField id="password" label="Password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-9"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            disabled={isLoading}
          />
        </AuthField>

        {error ? <AuthError>{error}</AuthError> : null}

        <Button type="submit" className="h-9 w-full" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}

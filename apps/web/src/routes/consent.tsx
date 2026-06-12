import { AnalyticsEvents } from '@durabull/analytics/events'
import { trackEvent } from '@durabull/analytics/browser'
import {
  labelConsentScopes,
  type McpOAuthConsentContext,
  parseMcpOAuthConsentSearch,
  submitOAuthConsent,
} from '@durabull/auth/client'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AuthLayout } from '@/components/auth-layout'
import { DurabullLogo, DurabullWordmark } from '@/components/durabull-logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'

export const Route = createFileRoute('/consent')({
  validateSearch: (search: Record<string, unknown>) => parseMcpOAuthConsentSearch(search),
  component: ConsentPage,
})

function ConsentPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: sessionLoading } = useAuth()
  const [context, setContext] = useState<McpOAuthConsentContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const consentPathWithSearch = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/consent'
    }
    return `${window.location.pathname}${window.location.search}`
  }, [search])

  const labeledScopes = useMemo(() => labelConsentScopes(context?.scopes ?? []), [context?.scopes])

  useEffect(() => {
    if (sessionLoading) {
      return
    }

    if (!isAuthenticated) {
      navigate({
        to: '/login',
        search: { redirect: consentPathWithSearch },
        replace: true,
      })
    }
  }, [consentPathWithSearch, isAuthenticated, navigate, sessionLoading])

  useEffect(() => {
    if (!isAuthenticated || !search.consent_code) {
      return
    }

    let cancelled = false

    async function loadConsentContext() {
      setContextError(null)
      try {
        const response = await fetch(
          `/api/mcp/oauth-consent/${encodeURIComponent(search.consent_code!)}`,
          { credentials: 'include' }
        )
        const data = (await response.json()) as McpOAuthConsentContext & {
          message?: string
          error?: string
        }
        if (response.status === 403 && data.error === 'client_disabled') {
          if (!cancelled) {
            setContext({
              clientId: data.clientId,
              name: data.name,
              icon: data.icon ?? null,
              disabled: true,
              scopes: data.scopes ?? [],
            })
          }
          return
        }
        if (!response.ok) {
          throw new Error(data.message ?? data.error ?? 'Unable to load authorization request')
        }

        if (search.client_id && data.clientId !== search.client_id) {
          throw new Error('Authorization link does not match the requesting application')
        }

        if (!cancelled) {
          setContext(data)
        }
      } catch (error) {
        if (!cancelled) {
          setContext(null)
          setContextError(
            error instanceof Error ? error.message : 'Unable to load authorization request'
          )
        }
      }
    }

    void loadConsentContext()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, search.client_id, search.consent_code])

  const missingConsentCode = !search.consent_code

  const handleConsent = async (accept: boolean) => {
    if (context?.disabled) {
      setActionError('This application has been disabled and cannot be authorized.')
      return
    }

    setIsSubmitting(true)
    setActionError(null)
    try {
      const result = await submitOAuthConsent({
        accept,
        consentCode: search.consent_code,
      })
      trackEvent(
        accept ? AnalyticsEvents.MCP_CONSENT_GRANTED : AnalyticsEvents.MCP_CONSENT_DENIED,
        {
          success: accept,
          scope_count: context?.scopes.length ?? 0,
        }
      )
      window.location.assign(result.redirectURI)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to complete authorization')
      setIsSubmitting(false)
    }
  }

  if (sessionLoading || !isAuthenticated) {
    return (
      <AuthLayout>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-lg border-border/60 bg-card/95 p-6 shadow-xl">
          <div className="mb-6 flex items-center gap-3">
            <DurabullLogo className="h-9 w-9" />
            <DurabullWordmark className="h-6" />
          </div>

          <div className="mb-4 flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Authorize application</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Review the access requested before connecting to Durabull MCP.
              </p>
            </div>
          </div>

          {missingConsentCode ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              This authorization link is incomplete or expired. Start again from your MCP client.
            </div>
          ) : contextError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {contextError}
            </div>
          ) : !context ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading authorization details…
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-md border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Application
                </p>
                <p className="mt-1 text-base font-medium">{context.name}</p>
                {context.disabled ? (
                  <p className="mt-2 text-sm text-destructive">
                    This application has been disabled and cannot be authorized.
                  </p>
                ) : null}
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-sm font-medium">Requested access</p>
                <ul className="space-y-2">
                  {labeledScopes.map((entry) => (
                    <li
                      key={entry.scope}
                      className="rounded-md border border-border/60 bg-background/60 px-3 py-2"
                    >
                      <p className="text-sm font-medium">
                        {entry.title}
                        {entry.unknownScope ? (
                          <span className="ml-2 text-xs font-normal text-status-warning">
                            (unrecognized scope)
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {actionError ? (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  data-testid="mcp-consent-allow"
                  disabled={isSubmitting || context.disabled}
                  onClick={() => void handleConsent(true)}
                >
                  {isSubmitting ? 'Authorizing…' : 'Allow access'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="mcp-consent-deny"
                  disabled={isSubmitting}
                  onClick={() => void handleConsent(false)}
                >
                  Deny
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </AuthLayout>
  )
}

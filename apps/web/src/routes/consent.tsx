import {
  type LabeledConsentScope,
  labelConsentScopes,
  type McpOAuthConsentContext,
  parseMcpOAuthConsentSearch,
  submitOAuthConsent,
} from '@durabull/auth/client'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, Link2Off, Loader2, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AuthError, AuthLayout, AuthLoading } from '@/components/auth-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useAuth } from '@/hooks/use-auth'
import { useOrganizations } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/consent')({
  validateSearch: (search: Record<string, unknown>) => parseMcpOAuthConsentSearch(search),
  component: ConsentPage,
})

function ConsentPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: sessionLoading, user } = useAuth()
  // Delegated access follows the signed-in user, so it reaches every organization they belong to.
  const { data: organizations } = useOrganizations()
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
      window.location.assign(result.redirectURI)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to complete authorization')
      setIsSubmitting(false)
    }
  }

  if (sessionLoading || !isAuthenticated) {
    return <AuthLoading />
  }

  const readScopes = labeledScopes.filter((entry) => !entry.writeScope && !entry.unknownScope)
  const writeScopes = labeledScopes.filter((entry) => entry.writeScope)
  const unknownScopes = labeledScopes.filter((entry) => entry.unknownScope && !entry.writeScope)
  const organizationNames = (organizations ?? []).map((organization) => organization.name)

  return (
    <AuthLayout
      width="wide"
      footer={context ? 'Only allow applications you recognize and trust.' : undefined}
    >
      {missingConsentCode ? (
        <>
          <h1 className="sr-only">Authorize application</h1>
          <EmptyState
            size="inline"
            tone="danger"
            icon={Link2Off}
            title="This authorization link is incomplete or expired"
            description="Start again from your MCP client to get a fresh link."
            className="px-0 py-2"
          />
        </>
      ) : contextError ? (
        <>
          <h1 className="sr-only">Authorize application</h1>
          <EmptyState
            size="inline"
            tone="danger"
            icon={ShieldAlert}
            title="This request can't be authorized"
            description={
              <>
                {contextError}
                <span className="block">Start again from your MCP client to get a fresh link.</span>
              </>
            }
            className="px-0 py-2"
          />
        </>
      ) : !context ? (
        <>
          <h1 className="mb-4 text-[13px] font-medium text-muted-foreground">
            Authorize application
          </h1>
          <div
            className="flex items-center gap-2 text-[13px] text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading authorization details…
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-4 text-[13px] font-medium text-muted-foreground">
            Authorize application
          </h1>

          {/* Who is asking */}
          <div className="flex items-center gap-3">
            <ClientMark name={context.name} icon={context.icon} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight">{context.name}</p>
              <p className="text-[13px] leading-5 text-muted-foreground">
                wants to access Durabull on your behalf
              </p>
            </div>
          </div>

          {context.disabled ? (
            <AuthError className="mt-4">
              This application has been disabled and cannot be authorized.
            </AuthError>
          ) : null}

          {/* Whose data it reaches */}
          <dl className="mt-5 divide-y rounded-lg border text-[13px] leading-5">
            <ConsentFact label="Account">
              <span className="truncate">{user?.email ?? user?.name ?? 'Your account'}</span>
            </ConsentFact>
            {organizationNames.length > 0 ? (
              <ConsentFact
                label={organizationNames.length === 1 ? 'Organization' : 'Organizations'}
              >
                <span className="truncate" title={organizationNames.join(', ')}>
                  {organizationNames.slice(0, 2).join(', ')}
                </span>
                {organizationNames.length > 2 ? (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    +{organizationNames.length - 2}
                  </span>
                ) : null}
              </ConsentFact>
            ) : null}
            <ConsentFact label="Client ID">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {context.clientId}
              </span>
            </ConsentFact>
          </dl>

          {/* What it gets */}
          <div className="mt-5 space-y-4">
            <ScopeGroup label="Can view" entries={readScopes} />
            <ScopeGroup
              label="Can change"
              entries={writeScopes}
              tag={<Badge variant="warning">Write</Badge>}
            />
            <ScopeGroup
              label="Unrecognized"
              entries={unknownScopes}
              tag={<Badge variant="warning">Unrecognized</Badge>}
            />
          </div>

          {actionError ? <AuthError className="mt-5">{actionError}</AuthError> : null}

          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9"
              data-testid="mcp-consent-deny"
              disabled={isSubmitting}
              onClick={() => void handleConsent(false)}
            >
              Deny
            </Button>
            <Button
              type="button"
              className="h-9"
              data-testid="mcp-consent-allow"
              disabled={isSubmitting || context.disabled}
              onClick={() => void handleConsent(true)}
            >
              {isSubmitting ? 'Authorizing…' : 'Allow access'}
            </Button>
          </div>
        </>
      )}
    </AuthLayout>
  )
}

/** The requesting client's icon, or its initial when it did not register one. */
function ClientMark({ name, icon }: { name: string; icon: string | null }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted font-mono text-sm font-medium text-muted-foreground">
      {icon ? (
        <img src={icon} alt="" className="h-full w-full object-cover" />
      ) : (
        (name.trim()[0]?.toUpperCase() ?? '?')
      )}
    </span>
  )
}

function ConsentFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5">{children}</dd>
    </div>
  )
}

function ScopeGroup({
  label,
  entries,
  tag,
}: {
  label: string
  entries: LabeledConsentScope[]
  /**
   * Marks every row of the group as deserving a second look. Tagged groups
   * get full-width rows; untagged (read) groups use a compact two-column list.
   */
  tag?: React.ReactNode
}) {
  if (entries.length === 0) return null

  return (
    <section>
      <h2 className="eyebrow mb-1.5 flex items-center gap-1.5">
        {label}
        <span className="text-faint">{entries.length}</span>
      </h2>
      <ul className="divide-y rounded-lg border">
        {entries.map((entry) =>
          tag ? (
            <li
              key={entry.scope}
              className="flex items-start gap-2.5 px-3 py-2"
              title={entry.scope}
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-[13px] font-medium leading-5',
                    entry.unknownScope && 'break-all font-mono text-xs'
                  )}
                >
                  {entry.title}
                </p>
                <p className="text-xs leading-4 text-muted-foreground">{entry.description}</p>
              </div>
              <span className="shrink-0">{tag}</span>
            </li>
          ) : (
            <li
              key={entry.scope}
              className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2.5 px-3 py-1.5 sm:grid-cols-[16px_144px_minmax(0,1fr)]"
              title={entry.scope}
            >
              <Check className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <p className="text-[13px] font-medium leading-5">{entry.title}</p>
              <p className="col-start-2 text-xs leading-4 text-muted-foreground sm:col-start-3 sm:leading-5">
                {entry.description}
              </p>
            </li>
          )
        )}
      </ul>
    </section>
  )
}

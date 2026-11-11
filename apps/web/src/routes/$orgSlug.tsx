import { createFileRoute, Navigate, Outlet, useNavigate } from '@tanstack/react-router'
import { Loader2, ShieldX, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { TransitionBanner } from '@/components/billing/transition-banner'
import { UpgradePromptHost } from '@/components/billing/upgrade-prompt-host'
import { PageTitle } from '@/components/page-title'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import {
  useActiveOrganization,
  useOrganizations,
  useSetActiveOrganization,
} from '@/hooks/use-organization'

export const Route = createFileRoute('/$orgSlug')({
  // Note: We intentionally don't use beforeLoad for auth calls here.
  // During SSR, the Better Auth client SDK doesn't have access to session cookies,
  // which causes 401 errors. Instead, we handle organization switching in the
  // component after hydration when the client has proper cookie access.
  component: OrgSlugLayout,
})

/**
 * Organization slug layout route.
 * Handles organization switching on the client side after hydration.
 * This avoids SSR auth issues where the Better Auth client SDK
 * doesn't have access to session cookies.
 */
function OrgSlugLayout() {
  const { orgSlug } = Route.useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, session } = useAuth()
  const { isAuthless } = useAppMode()
  const { data: organizations, isLoading: orgsLoading } = useOrganizations()
  const { data: activeOrganization } = useActiveOrganization()
  const setActiveOrg = useSetActiveOrganization()

  // Find the organization by slug
  const org = organizations?.find((o) => o.slug === orgSlug)

  // Get current active org ID from session
  const activeOrgId = (session as { activeOrganizationId?: string })?.activeOrganizationId

  // The organization we last asked the server to switch to. Keyed by id rather than a
  // boolean so moving to another organization's URL always triggers a new switch.
  const requestedOrgIdRef = useRef<string | null>(null)

  // Switch the server session to the URL's organization when it isn't already active.
  useEffect(() => {
    if (!org || isAuthless || activeOrgId === org.id) return
    if (requestedOrgIdRef.current === org.id) return
    requestedOrgIdRef.current = org.id
    setActiveOrg.mutate(org.id, {
      onError: () => {
        // Allow "Try again" (and the next render) to request the switch again.
        requestedOrgIdRef.current = null
      },
    })
  }, [org, activeOrgId, isAuthless, setActiveOrg])

  // Show loading while checking auth or fetching organizations
  if (authLoading || orgsLoading) {
    return <OrgLoading label="Loading…" />
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated && !isAuthless) {
    return <Navigate to="/login" replace />
  }

  // Organization not found or user doesn't have access - show 403
  if (!org) {
    return (
      <OrganizationUnavailable
        orgSlug={orgSlug}
        isAuthless={isAuthless}
        onGoHome={() => navigate({ to: '/' })}
      />
    )
  }

  // Organization-scoped API calls use the session's active organization, so pages
  // must not render (and start reading or writing) until the server session is on
  // the organization in the URL: either it already was, or our switch to it has
  // succeeded. An install without accounts has exactly one organization, so there
  // is nothing to wait for.
  const isOrganizationActive =
    isAuthless ||
    activeOrgId === org.id ||
    (setActiveOrg.isSuccess && setActiveOrg.variables === org.id) ||
    activeOrganization?.id === org.id
  if (!isOrganizationActive) {
    if (setActiveOrg.isError) {
      return (
        <EmptyState
          tone="danger"
          icon={TriangleAlert}
          title={`Couldn't switch to ${org.name}`}
          description={setActiveOrg.error.message}
          className="min-h-[min(420px,60vh)]"
          actions={
            <Button
              onClick={() => {
                requestedOrgIdRef.current = org.id
                setActiveOrg.mutate(org.id, {
                  onError: () => {
                    requestedOrgIdRef.current = null
                  },
                })
              }}
              disabled={setActiveOrg.isPending}
            >
              Try again
            </Button>
          }
        />
      )
    }
    return <OrgLoading label={`Switching to ${org.name}…`} />
  }

  // Valid organization - render children
  return (
    <>
      <Outlet />
      <UpgradePromptHost orgSlug={orgSlug} />
      <TransitionBanner orgSlug={orgSlug} />
    </>
  )
}

function OrgLoading({ label }: { label: string }) {
  return (
    <div
      className="flex h-full min-h-60 flex-col items-center justify-center gap-3"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  )
}

/** The slug in the URL matches no organization this user can open. */
function OrganizationUnavailable({
  orgSlug,
  isAuthless,
  onGoHome,
}: {
  orgSlug: string
  isAuthless: boolean
  onGoHome: () => void
}) {
  const topBarConfig = useMemo(
    () => ({ left: <PageTitle title={`/${orgSlug}`} mono /> }),
    [orgSlug]
  )

  useAppTopBar(topBarConfig)

  return (
    <EmptyState
      tone="danger"
      icon={ShieldX}
      title={isAuthless ? 'Workspace not found' : "You don't have access to this organization"}
      description={
        <>
          <span className="font-mono text-foreground">/{orgSlug}</span>{' '}
          {isAuthless
            ? "doesn't exist on this install."
            : "doesn't exist, or you haven't been invited to it. Ask an owner for an invitation, or switch organization."}
        </>
      }
      className="min-h-[min(420px,60vh)]"
      actions={<Button onClick={onGoHome}>Go to home</Button>}
    />
  )
}

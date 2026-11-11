import { createFileRoute, Navigate, Outlet, useNavigate } from '@tanstack/react-router'
import { Loader2, ShieldX } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { TransitionBanner } from '@/components/billing/transition-banner'
import { UpgradePromptHost } from '@/components/billing/upgrade-prompt-host'
import { PageTitle } from '@/components/page-title'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { useOrganizations, useSetActiveOrganization } from '@/hooks/use-organization'

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
  const setActiveOrg = useSetActiveOrganization()

  // Track if we've already set the active org to prevent loops
  const hasSetActiveRef = useRef(false)

  // Find the organization by slug
  const org = organizations?.find((o) => o.slug === orgSlug)

  // Get current active org ID from session
  const activeOrgId = (session as { activeOrganizationId?: string })?.activeOrganizationId

  // Set the active organization when we have the data and it's different
  useEffect(() => {
    if (org && activeOrgId !== org.id && !hasSetActiveRef.current && !setActiveOrg.isPending) {
      hasSetActiveRef.current = true
      setActiveOrg.mutate(org.id, {
        onError: () => {
          // Reset on error so we can retry
          hasSetActiveRef.current = false
        },
      })
    }
  }, [org, activeOrgId, setActiveOrg])

  // Reset the ref when slug changes (orgSlug in deps is intentional)
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally reset when orgSlug changes
  useEffect(() => {
    hasSetActiveRef.current = false
  }, [orgSlug])

  // Show loading while checking auth or fetching organizations
  if (authLoading || orgsLoading) {
    return (
      <div
        className="flex h-full min-h-60 flex-col items-center justify-center gap-3"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      </div>
    )
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

  // Valid organization - render children
  return (
    <>
      <Outlet />
      <UpgradePromptHost orgSlug={orgSlug} />
      <TransitionBanner orgSlug={orgSlug} />
    </>
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

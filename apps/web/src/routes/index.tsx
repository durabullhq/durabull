import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { useActiveOrganization, useOrganizations } from '@/hooks/use-organization'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Durabull - BullMQ Admin Dashboard' },
      {
        name: 'description',
        content:
          'The modern, powerful dashboard for BullMQ. Monitor jobs, debug failures, and scale your background processing with confidence.',
      },
    ],
  }),
  component: IndexRoute,
})

/**
 * Index route that:
 * 1. Redirects authenticated users to their organization dashboard
 * 2. Redirects unauthenticated users to the login page
 */
function IndexRoute() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { isAuthless } = useAppMode()
  const { data: organizations, isLoading: orgsLoading } = useOrganizations()
  const { data: activeOrg, isLoading: activeOrgLoading } = useActiveOrganization()

  // Handle redirects after hydration
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return

    // Not authenticated - redirect to login
    if (!isAuthenticated && !isAuthless) {
      navigate({ to: '/login', replace: true })
      return
    }

    // Still loading organizations
    if (orgsLoading || activeOrgLoading) return

    // No organizations - redirect to setup
    if (!organizations || organizations.length === 0) {
      navigate({ to: '/setup-organization', replace: true })
      return
    }

    // Has active organization - redirect to it
    if (activeOrg?.slug) {
      navigate({ to: '/$orgSlug', params: { orgSlug: activeOrg.slug }, replace: true })
      return
    }

    // Has organizations but no active one - redirect to first org
    const firstOrg = organizations[0]
    if (firstOrg?.slug) {
      navigate({ to: '/$orgSlug', params: { orgSlug: firstOrg.slug }, replace: true })
    }
  }, [
    authLoading,
    isAuthenticated,
    isAuthless,
    orgsLoading,
    activeOrgLoading,
    organizations,
    activeOrg,
    navigate,
  ])

  // Show loading while checking auth and redirecting
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

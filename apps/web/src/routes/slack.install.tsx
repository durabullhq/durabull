import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useAppMode } from '@/hooks/use-app-mode'
import { useAuth } from '@/hooks/use-auth'
import { useActiveOrganization, useOrganizations } from '@/hooks/use-organization'
import { SLACK_INSTALL_REQUEST } from '@/lib/slack-destination'

export const Route = createFileRoute('/slack/install')({
  head: () => ({ meta: [{ title: 'Add Durabull to Slack' }] }),
  component: SlackInstallRoute,
})

/**
 * The Slack app's direct install URL. Slack's App Directory, the marketing
 * site and shared install links all point here. Durabull needs to know which
 * organization a workspace belongs to, so the install always runs from that
 * organization's integrations page: sign in, pick the active organization, and
 * the Slack card starts the OAuth flow. Members of several organizations are
 * asked to confirm the organization (or switch) and select Add to Slack.
 */
function SlackInstallRoute() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { isAuthless } = useAppMode()
  const { data: organizations, isLoading: orgsLoading } = useOrganizations()
  const { data: activeOrg, isLoading: activeOrgLoading } = useActiveOrganization()

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated && !isAuthless) {
      navigate({ to: '/login', search: { redirect: '/slack/install' }, replace: true })
      return
    }
    if (orgsLoading || activeOrgLoading) return
    if (!organizations || organizations.length === 0) {
      // Come back here once they have an organization.
      navigate({ to: '/setup-organization', search: { redirect: '/slack/install' }, replace: true })
      return
    }
    const slug = activeOrg?.slug ?? organizations[0]?.slug
    if (!slug) return
    // With several organizations, ask before connecting rather than guessing.
    const request =
      organizations.length > 1 ? SLACK_INSTALL_REQUEST.confirm : SLACK_INSTALL_REQUEST.start
    navigate({
      href: `/${encodeURIComponent(slug)}/settings/integrations?slack=${request}`,
      replace: true,
    })
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

  return (
    <div
      className="flex h-full min-h-60 flex-col items-center justify-center gap-3"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-[13px] text-muted-foreground">Connecting Slack…</p>
    </div>
  )
}

import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/hooks/use-auth'
import { type Organization, useOrganizations } from '@/hooks/use-organization'
import { SESSION_KEYS, type SessionWithActiveOrganization } from '@/lib/session-keys'

export const Route = createFileRoute('/settings')({
  component: LegacySettingsRedirect,
})

function LegacySettingsRedirect() {
  const { session } = useAuth()
  const { data: organizations } = useOrganizations()
  const activeOrgId = (session as SessionWithActiveOrganization | null)?.[
    SESSION_KEYS.ACTIVE_ORGANIZATION_ID
  ]
  const activeOrgSlug = organizations?.find((org: Organization) => org.id === activeOrgId)?.slug
  const search = Object.fromEntries(
    new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).entries()
  )
  const destination = search.linear ? '/$orgSlug/settings/integrations' : '/$orgSlug/settings/connections'

  if (!activeOrgSlug) {
    return <Navigate to="/" replace />
  }

  return (
    <Navigate
      to={destination}
      params={{ orgSlug: activeOrgSlug }}
      search={search}
      replace
    />
  )
}

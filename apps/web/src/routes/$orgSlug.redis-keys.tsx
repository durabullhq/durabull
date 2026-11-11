import { createFileRoute } from '@tanstack/react-router'
import { Database } from 'lucide-react'
import { NoConnectionConfigured } from '@/components/no-connection-configured'

export const Route = createFileRoute('/$orgSlug/redis-keys')({
  component: RedisKeysFallbackRoute,
})

function RedisKeysFallbackRoute() {
  const { orgSlug } = Route.useParams()

  return (
    <NoConnectionConfigured
      orgSlug={orgSlug}
      area="KV Explorer"
      icon={Database}
      description="KV Explorer cannot enumerate keys until a connection is configured for this organization."
    />
  )
}

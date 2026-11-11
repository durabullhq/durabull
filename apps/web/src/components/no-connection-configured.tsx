import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useAppTopBar } from '@/components/app-top-bar'
import { PageTitle } from '@/components/page-title'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppMode } from '@/hooks/use-app-mode'

interface NoConnectionConfiguredProps {
  orgSlug: string
  area: string
  icon: LucideIcon
  description?: string
}

/**
 * Shown in place of a connection-scoped page (queues, workers, analytics…)
 * when the workspace has no Redis connection to read from.
 */
export function NoConnectionConfigured({
  orgSlug,
  area,
  icon,
  description,
}: NoConnectionConfiguredProps) {
  const { envConnections } = useAppMode()

  const topBarConfig = useMemo(() => ({ left: <PageTitle title={area} /> }), [area])

  useAppTopBar(topBarConfig)

  const bodyCopy =
    description ??
    (envConnections
      ? `${area} needs a Redis connection. This deployment reads connections from DURABULL_REDIS_URL_* environment variables: set them and restart.`
      : `${area} needs a Redis connection. Connect the Redis instance your BullMQ workers use and this page fills in by itself.`)

  return (
    <EmptyState
      icon={icon}
      title="No Redis connection"
      description={bodyCopy}
      className="min-h-[min(420px,60vh)]"
      actions={
        <>
          <Button asChild>
            <Link
              to="/$orgSlug/connections"
              params={{ orgSlug }}
              search={envConnections ? undefined : { create: 1 }}
            >
              {envConnections ? 'View connections' : 'Connect a Redis instance'}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/$orgSlug" params={{ orgSlug }} search={{ onboarding: 1 }}>
              Setup guide
            </Link>
          </Button>
        </>
      }
    />
  )
}

import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties } from '@durabull/analytics/events'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAppVersionCheck } from '@/hooks/use-app-version-check'

export function reloadToLatestBuild() {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('__durabull_update', Date.now().toString(36))
  window.location.replace(nextUrl.toString())
}

interface AppUpdateBannerProps {
  onUpdate?: () => void
}

export function AppUpdateBanner({ onUpdate = reloadToLatestBuild }: AppUpdateBannerProps) {
  const { client, server, updateRequired, updateReason } = useAppVersionCheck()
  const [isUpdating, setIsUpdating] = useState(false)

  if (!updateRequired || !server) return null

  const handleUpdate = () => {
    setIsUpdating(true)
    try {
      trackEvent(AnalyticsEvents.APP_UPDATE_CLICKED, {
        [AnalyticsProperties.APP_VERSION]: client.version,
        [AnalyticsProperties.APP_BUILD_ID]: client.buildId,
        [AnalyticsProperties.CLIENT_VERSION]: client.version,
        [AnalyticsProperties.CLIENT_BUILD_ID]: client.buildId,
        [AnalyticsProperties.API_VERSION]: server.version,
        [AnalyticsProperties.API_BUILD_ID]: server.buildId,
        [AnalyticsProperties.SERVER_VERSION]: server.version,
        [AnalyticsProperties.SERVER_BUILD_ID]: server.buildId,
        [AnalyticsProperties.UPDATE_REASON]: updateReason,
        [AnalyticsProperties.RELEASE_CHANNEL]: server.releaseChannel,
        action: 'reload',
      })
    } catch {
      // Updating the app must not depend on analytics availability.
    }

    window.setTimeout(onUpdate, 150)
  }

  return (
    <aside
      aria-label="Application update"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-status-warning/30 bg-background/95 p-3 text-foreground shadow-2xl shadow-black/25 backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-status-warning/15 text-status-warning">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">Update available</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Reload to apply the latest Durabull build.
          </p>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={handleUpdate} disabled={isUpdating}>
              <RefreshCw className={isUpdating ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
              Update
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}

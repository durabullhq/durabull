import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { type AnalyticsWindowValue, METRICS_WINDOWS } from './analytics-window-options'

/**
 * Time-range segmented control plus a refresh icon button. Compact enough to
 * live in the top bar so the range stays visible while the page scrolls.
 */
export function AnalyticsWindowControls({
  selectedWindow,
  isRefreshing,
  onWindowChange,
  onRefresh,
  refreshTitle = 'Refresh',
  className,
}: {
  selectedWindow: AnalyticsWindowValue
  isRefreshing: boolean
  onWindowChange: (window: AnalyticsWindowValue) => void
  onRefresh: () => void
  /** Tooltip for the refresh button, e.g. to state the auto-refresh cadence. */
  refreshTitle?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Tabs
        value={selectedWindow}
        onValueChange={(value) => onWindowChange(value as AnalyticsWindowValue)}
      >
        <TabsList role="group" aria-label="Time window" className="h-7">
          {METRICS_WINDOWS.map((entry) => (
            <TabsTrigger
              key={entry.value}
              value={entry.value}
              aria-pressed={selectedWindow === entry.value}
              className="px-2 font-mono text-[11px] tabular-nums"
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Button
        size="xs"
        variant="outline"
        // Stays fully opaque while disabled: the spinning icon already says "busy", and a
        // dimming control every auto-refresh reads as flicker.
        className="w-7 px-0 disabled:opacity-100"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="Refresh"
        title={refreshTitle}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} aria-hidden />
      </Button>
    </div>
  )
}

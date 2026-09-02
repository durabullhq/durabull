import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type AnalyticsWindowValue, METRICS_WINDOWS } from './analytics-window-options'

export function AnalyticsWindowControls({
  selectedWindow,
  isRefreshing,
  onWindowChange,
  onRefresh,
}: {
  selectedWindow: AnalyticsWindowValue
  isRefreshing: boolean
  onWindowChange: (window: AnalyticsWindowValue) => void
  onRefresh: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/80 p-3">
      {METRICS_WINDOWS.map((entry) => (
        <Button
          key={entry.value}
          size="xs"
          variant={selectedWindow === entry.value ? 'default' : 'outline'}
          onClick={() => onWindowChange(entry.value)}
        >
          {entry.label}
        </Button>
      ))}
      <Button
        size="xs"
        variant="outline"
        className="ml-2"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        Refresh
      </Button>
    </div>
  )
}

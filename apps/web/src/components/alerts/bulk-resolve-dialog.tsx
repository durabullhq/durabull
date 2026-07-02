import { CheckCheck, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTypeBadge, formatAlertDate } from '@/components/alerts/alert-primitives'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useBulkResolveAlertEvents,
  useConnectionAlertEvents,
  useConnectionAlertRules,
  type AlertEventRecord,
} from '@/hooks/use-alerts'

const PAGE_LIMIT = 100

interface BulkResolveDialogProps {
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select a rule so the dialog opens scoped to one alert. */
  initialRuleId?: string
}

export function BulkResolveDialog({
  connectionId,
  open,
  onOpenChange,
  initialRuleId,
}: BulkResolveDialogProps) {
  const [ruleFilter, setRuleFilter] = useState<string>(initialRuleId ?? 'all')
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())

  const rulesQuery = useConnectionAlertRules(open ? connectionId : undefined)
  const eventsQuery = useConnectionAlertEvents(open ? connectionId : undefined, {
    status: 'firing',
    limit: PAGE_LIMIT,
    alertRuleId: ruleFilter === 'all' ? undefined : ruleFilter,
  })
  const bulkResolveMutation = useBulkResolveAlertEvents()

  const rules = rulesQuery.data?.rules ?? []
  const events = eventsQuery.data?.events ?? []

  // Reset stale state whenever the dialog opens or the filter changes.
  useEffect(() => {
    if (open) {
      setRuleFilter(initialRuleId ?? 'all')
      setSelectedEventIds(new Set())
    }
  }, [open, initialRuleId])

  const visibleSelectedCount = useMemo(
    () => events.filter((event) => selectedEventIds.has(event.id)).length,
    [events, selectedEventIds]
  )
  const allVisibleSelected = events.length > 0 && visibleSelectedCount === events.length

  function toggleEvent(eventId: string) {
    setSelectedEventIds((previous) => {
      const next = new Set(previous)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  function toggleAll() {
    setSelectedEventIds((previous) => {
      if (allVisibleSelected) {
        const next = new Set(previous)
        for (const event of events) next.delete(event.id)
        return next
      }
      const next = new Set(previous)
      for (const event of events) next.add(event.id)
      return next
    })
  }

  async function handleResolveSelected() {
    const eventIds = events
      .filter((event) => selectedEventIds.has(event.id))
      .map((event) => event.id)
    if (eventIds.length === 0) return

    try {
      const result = await bulkResolveMutation.mutateAsync({ connectionId, eventIds })
      setSelectedEventIds(new Set())
      toast.success(
        `Resolved ${result.resolvedCount} incident${result.resolvedCount === 1 ? '' : 's'}`,
        {
          description:
            'Linked Linear issues are being completed in the background where applicable.',
        }
      )
    } catch (error) {
      toast.error('Failed to resolve incidents', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bulk resolve incidents</DialogTitle>
          <DialogDescription>
            Select firing incidents to resolve in one action. Linked Linear issues will be marked
            done automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <Select
            value={ruleFilter}
            onChange={(event) => {
              setRuleFilter(event.target.value)
              setSelectedEventIds(new Set())
            }}
            className="h-9 w-[260px]"
            aria-label="Filter incidents by alert rule"
          >
            <option value="all">All alert rules</option>
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name}
              </option>
            ))}
          </Select>
          <span className="text-sm text-muted-foreground">
            {events.length >= PAGE_LIMIT
              ? `Showing first ${PAGE_LIMIT} firing incidents — resolve to load more`
              : `${events.length} firing incident${events.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70">
          {eventsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No firing incidents</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Everything matching this filter has already been resolved.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Select all firing incidents"
                      className="rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Queue</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Fired</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <BulkResolveRow
                    key={event.id}
                    event={event}
                    selected={selectedEventIds.has(event.id)}
                    onToggle={() => toggleEvent(event.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {visibleSelectedCount} selected
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={handleResolveSelected}
              disabled={visibleSelectedCount === 0 || bulkResolveMutation.isPending}
            >
              {bulkResolveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resolving
                </>
              ) : (
                <>
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Resolve {visibleSelectedCount > 0 ? visibleSelectedCount : ''} incident
                  {visibleSelectedCount === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkResolveRow({
  event,
  selected,
  onToggle,
}: {
  event: AlertEventRecord
  selected: boolean
  onToggle: () => void
}) {
  return (
    <TableRow
      className="cursor-pointer"
      data-state={selected ? 'selected' : undefined}
      onClick={onToggle}
    >
      <TableCell onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select incident: ${event.summary}`}
          className="rounded border-gray-300"
        />
      </TableCell>
      <TableCell>
        <AlertTypeBadge type={event.type} compact />
      </TableCell>
      <TableCell className="max-w-[180px]">
        <span className="block truncate font-medium">{event.queueName}</span>
      </TableCell>
      <TableCell className="max-w-[420px]">
        <p className="line-clamp-2 text-sm">{event.summary}</p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatAlertDate(event.firedAt)}
      </TableCell>
    </TableRow>
  )
}

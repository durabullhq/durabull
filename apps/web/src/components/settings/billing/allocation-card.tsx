import {
  CAPACITY_LIMIT_KEYS,
  type CapacityLimitKey,
  LIMIT_LABELS,
} from '@durabull/api-client/billing'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Panel, PanelHeader } from '@/components/ui/section'
import { type EnabledBillingOverview, useSaveCapacityAllocation } from '@/hooks/use-billing'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const ALLOCATION_KIND_LABELS: Record<string, string> = {
  connection: 'Connection',
  member: 'Member',
  invitation: 'Invitation',
  alert_rule: 'Alert rule',
  alert_destination: 'Destination',
  service_account: 'Service account',
}

export function AllocationCard({ overview }: { overview: EnabledBillingOverview }) {
  const [editing, setEditing] = useState<CapacityLimitKey | null>(null)
  const allocation = overview.allocation
  if (!allocation) return null
  const keys = CAPACITY_LIMIT_KEYS.filter((key) => {
    const options = allocation[key]
    const limit = overview.limits[key]
    return options.some((o) => o.suspended) || (limit !== null && options.length > limit)
  })
  if (keys.length === 0) return null

  return (
    <Panel>
      <PanelHeader className="flex-col items-start gap-0.5 py-2.5">
        <h3 className="text-[13px] font-semibold">Choose what stays enabled</h3>
        <p className="text-xs text-muted-foreground">
          Paused resources keep their configuration and can be restored at any time. Pausing never
          changes your Redis data or queues.
        </p>
      </PanelHeader>
      <div className="divide-y">
        {keys.map((key) => {
          const options = allocation[key]
          const paused = options.filter((o) => o.suspended).length
          return (
            <div
              key={key}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-[13px]"
            >
              <span className="min-w-0 flex-1 basis-full truncate sm:basis-0">
                {LIMIT_LABELS[key].name}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {options.length - paused} enabled of {overview.limits[key] ?? '∞'} allowed
                {paused > 0 ? ` · ${paused} paused` : ''}
              </span>
              {overview.canManageBilling ? (
                <Button type="button" variant="outline" size="xs" onClick={() => setEditing(key)}>
                  Choose
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  The organization owner chooses.
                </span>
              )}
            </div>
          )
        })}
      </div>
      {editing ? (
        <AllocationDialog
          limitKey={editing}
          options={allocation[editing]}
          limit={overview.limits[editing]}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Panel>
  )
}

function AllocationDialog({
  limitKey,
  options,
  limit,
  onClose,
}: {
  limitKey: CapacityLimitKey
  options: EnabledBillingOverview['allocation'] extends infer A
    ? A extends Record<CapacityLimitKey, infer O>
      ? O
      : never
    : never
  limit: number | null
  onClose: () => void
}) {
  const save = useSaveCapacityAllocation()
  const [selected, setSelected] = useState<Set<string>>(() => {
    const kept = new Set<string>()
    for (const o of options) if (!o.suspended || o.pinned) kept.add(o.id)
    return kept
  })
  const pinnedCount = useMemo(() => options.filter((o) => o.pinned).length, [options])
  const max = limit === null ? options.length : Math.max(limit, pinnedCount)
  const tooMany = selected.size > max

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{LIMIT_LABELS[limitKey].name}</DialogTitle>
          <DialogDescription>
            Select up to {max} to keep enabled. The rest are paused until you upgrade or change this
            selection.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 divide-y overflow-auto rounded-md border">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-muted/60"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-foreground"
                checked={selected.has(option.id)}
                disabled={option.pinned}
                onChange={(event) => {
                  setSelected((current) => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(option.id)
                    else next.delete(option.id)
                    return next
                  })
                }}
              />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <Badge variant="outline">{ALLOCATION_KIND_LABELS[option.kind] ?? option.kind}</Badge>
              {option.pinned ? <Badge variant="neutral">Owner</Badge> : null}
            </label>
          ))}
        </div>
        <DialogFooter>
          {tooMany ? (
            <span className="mr-auto self-center text-xs text-status-warning">
              {selected.size} selected; your plan allows {max}.
            </span>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={tooMany || save.isPending}
            onClick={() =>
              save.mutate(
                { [limitKey]: [...selected] },
                {
                  onSuccess: () => {
                    toast.success('Selection saved')
                    onClose()
                  },
                  onError: (error) =>
                    toast.error('Could not save selection', {
                      description: errorMessage(error, ''),
                    }),
                }
              )
            }
          >
            Save selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

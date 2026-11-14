import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Gauge, Loader2, TimerOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  useClearQueueRateLimit,
  useQueueFlowControls,
  useUpdateQueueFlowControls,
} from '@/hooks/use-queues'
import {
  DURATION_UNITS,
  type DurationUnit,
  diffFlowControls,
  type FlowControlLimits,
  type FlowControlsForm,
  formFromLimits,
  validateFlowControlsForm,
} from '@/lib/flow-controls'
import { cn, formatNumber } from '@/lib/utils'

const CHECKBOX_CLASS =
  'h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed'

interface QueueFlowControlsDialogProps {
  queueName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function formatTtl(ms: number): string {
  if (ms < 1_000) return `${ms} ms`
  if (ms < 9_950) return `${(ms / 1_000).toFixed(1)} s`
  // Round once up front so the parts never read "60 s" or "1 min 60 s".
  const totalSeconds = Math.round(ms / 1_000)
  if (totalSeconds < 60) return `${totalSeconds} s`
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} s`
}

export function QueueFlowControlsDialog({
  queueName,
  open,
  onOpenChange,
}: QueueFlowControlsDialogProps) {
  const {
    data: state,
    isLoading,
    isFetching,
    error,
  } = useQueueFlowControls(queueName, { enabled: open })
  const updateMutation = useUpdateQueueFlowControls()
  const clearMutation = useClearQueueRateLimit()
  const [form, setForm] = useState<FlowControlsForm | null>(null)
  // The limits the form was seeded from. Saves diff against this snapshot, not the
  // polled state, so a change someone else makes while the dialog is open is not
  // silently reverted by fields this user never touched.
  const [baseline, setBaseline] = useState<FlowControlLimits | null>(null)

  // Seed the form once per open from fresh server state (not a cached copy from a
  // previous open); polling must not clobber edits.
  useEffect(() => {
    if (!open) {
      setForm(null)
      setBaseline(null)
      return
    }
    if (state && !isFetching && form === null) {
      setForm(formFromLimits(state))
      setBaseline({
        globalConcurrency: state.globalConcurrency,
        globalRateLimit: state.globalRateLimit,
      })
    }
  }, [open, state, isFetching, form])

  const validation = useMemo(() => (form ? validateFlowControlsForm(form) : null), [form])
  const update = useMemo(() => {
    if (!baseline || !validation?.limits) return null
    return diffFlowControls(baseline, validation.limits)
  }, [baseline, validation])
  const hasChanges = update !== null && Object.keys(update).length > 0
  const isSaving = updateMutation.isPending
  const canSave = hasChanges && !isSaving

  const patchForm = (patch: Partial<FlowControlsForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))

  const handleSave = async () => {
    if (!update || !hasChanges) return
    try {
      await updateMutation.mutateAsync({ queueName, update })
      toast.success('Flow controls updated', {
        description: 'Workers apply the new limits the next time they fetch a job.',
      })
      onOpenChange(false)
    } catch {
      // Errors are surfaced by shared API handlers.
    }
  }

  const handleClearWindow = async () => {
    try {
      await clearMutation.mutateAsync(queueName)
      toast.success('Rate-limit window ended', {
        description: 'Workers can start jobs again right away. The limit still applies.',
      })
    } catch {
      // Errors are surfaced by shared API handlers.
    }
  }

  const concurrencyCap = state?.globalConcurrency ?? null

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        trackEvent(newOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
          [AnalyticsProperties.DIALOG_TYPE]: DialogType.QUEUE_FLOW_CONTROLS,
        })
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Flow controls</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Queue-wide limits for <span className="font-mono text-foreground">{queueName}</span>,
            stored in Redis. Every worker applies them, so you can throttle a queue during an
            incident without a redeploy.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error.message}
          </p>
        ) : isLoading || !form || !state ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading flow controls" />
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border"
              data-testid="flow-controls-status"
            >
              <div className="bg-background p-3">
                <p className="eyebrow">Active now</p>
                <p
                  className={cn(
                    'mt-1 font-mono text-sm tabular-nums',
                    state.isMaxed && 'text-status-warning'
                  )}
                >
                  {formatNumber(state.activeCount)}
                  {concurrencyCap !== null ? ` / ${formatNumber(concurrencyCap)}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {state.isMaxed
                    ? 'At the concurrency cap'
                    : concurrencyCap !== null
                      ? 'Below the concurrency cap'
                      : 'No queue-wide cap'}
                </p>
              </div>
              <div className="bg-background p-3">
                <p className="eyebrow">Throttle</p>
                {state.rateLimited ? (
                  <>
                    <p className="mt-1 font-mono text-sm tabular-nums text-status-warning">
                      {formatTtl(state.rateLimitTtlMs)} left
                    </p>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-xs"
                      onClick={handleClearWindow}
                      disabled={clearMutation.isPending}
                    >
                      {clearMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <TimerOff className="h-3 w-3" aria-hidden="true" />
                      )}
                      End window now
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-mono text-sm">Not throttled</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      No rate-limit window is open
                    </p>
                  </>
                )}
              </div>
            </div>

            <fieldset className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASS}
                  checked={form.concurrencyEnabled}
                  onChange={(event) => patchForm({ concurrencyEnabled: event.target.checked })}
                  disabled={isSaving}
                />
                Limit concurrent jobs
              </label>
              <p className="text-xs text-muted-foreground">
                Maximum jobs processing at once across all workers, regardless of each worker's own
                concurrency.
              </p>
              {form.concurrencyEnabled ? (
                <div className="space-y-1">
                  <Label htmlFor="flow-concurrency" className="sr-only">
                    Global concurrency
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="flow-concurrency"
                      inputMode="numeric"
                      className="h-8 w-28 font-mono"
                      value={form.concurrency}
                      onChange={(event) => patchForm({ concurrency: event.target.value })}
                      aria-invalid={validation?.concurrencyError ? true : undefined}
                      disabled={isSaving}
                      autoFocus
                    />
                    <span className="text-sm text-muted-foreground">jobs at a time</span>
                  </div>
                  {validation?.concurrencyError ? (
                    <p className="text-xs text-destructive">{validation.concurrencyError}</p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            <fieldset className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASS}
                  checked={form.rateLimitEnabled}
                  onChange={(event) => patchForm({ rateLimitEnabled: event.target.checked })}
                  disabled={isSaving}
                />
                Rate limit job starts
              </label>
              <p className="text-xs text-muted-foreground">
                Maximum jobs started per time window across all workers. Use it to protect a
                downstream API with its own quota.
              </p>
              {form.rateLimitEnabled ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="flow-rate-max" className="sr-only">
                      Jobs per window
                    </Label>
                    <Input
                      id="flow-rate-max"
                      inputMode="numeric"
                      className="h-8 w-24 font-mono"
                      value={form.rateLimitMax}
                      onChange={(event) => patchForm({ rateLimitMax: event.target.value })}
                      aria-invalid={validation?.rateLimitMaxError ? true : undefined}
                      disabled={isSaving}
                    />
                    <span className="text-sm text-muted-foreground">jobs every</span>
                    <Label htmlFor="flow-rate-duration" className="sr-only">
                      Window length
                    </Label>
                    <Input
                      id="flow-rate-duration"
                      inputMode="numeric"
                      className="h-8 w-20 font-mono"
                      value={form.rateLimitDuration}
                      onChange={(event) => patchForm({ rateLimitDuration: event.target.value })}
                      aria-invalid={validation?.rateLimitDurationError ? true : undefined}
                      disabled={isSaving}
                    />
                    <Label htmlFor="flow-rate-unit" className="sr-only">
                      Window unit
                    </Label>
                    <Select
                      id="flow-rate-unit"
                      className="h-8 w-32"
                      value={form.rateLimitUnit}
                      onChange={(event) =>
                        patchForm({ rateLimitUnit: event.target.value as DurationUnit })
                      }
                      disabled={isSaving}
                    >
                      {DURATION_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {validation?.rateLimitMaxError ? (
                    <p className="text-xs text-destructive">{validation.rateLimitMaxError}</p>
                  ) : null}
                  {validation?.rateLimitDurationError ? (
                    <p className="text-xs text-destructive">{validation.rateLimitDurationError}</p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            <p className="text-xs text-muted-foreground">
              Limits take effect the next time a worker fetches a job; running jobs are not
              interrupted. Workers on BullMQ releases without queue-level limits ignore them.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Gauge className="h-4 w-4" aria-hidden="true" />
            )}
            Save limits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

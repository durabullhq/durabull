import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { Gauge, Loader2, TimerOff } from 'lucide-react'
import { useMemo, useState } from 'react'
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
  type QueueFlowControlsResponse,
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
  formatTtl,
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

interface EditorState {
  form: FlowControlsForm
  /**
   * The limits the form was seeded from. Saves diff against this snapshot, not the
   * polled state, so a change someone else makes while the dialog is open is not
   * silently reverted by fields this user never touched.
   */
  baseline: FlowControlLimits
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Request failed.'
}

/**
 * Form state, validation, and the save / end-window actions for the dialog. Kept
 * out of the component so the dialog body is only layout.
 */
function useFlowControlsEditor({
  queueName,
  open,
  onSaved,
}: {
  queueName: string
  open: boolean
  onSaved: () => void
}) {
  const {
    data: state,
    isLoading,
    isFetching,
    error,
  } = useQueueFlowControls(queueName, { enabled: open })
  const updateMutation = useUpdateQueueFlowControls()
  const clearMutation = useClearQueueRateLimit()
  const [editor, setEditor] = useState<EditorState | null>(null)
  // Separate so one action's retry or an edit never hides the other action's failure.
  const [saveError, setSaveError] = useState<string | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)

  // Seed the editor once per open from fresh server state (not a cached copy from a
  // previous open, nor one whose refresh just failed); polling must not clobber edits.
  // Adjusted during render rather than in an effect so no frame shows a stale form.
  if (!open) {
    if (editor !== null) setEditor(null)
    if (saveError !== null) setSaveError(null)
    if (clearError !== null) setClearError(null)
  } else if (editor === null && state && !isFetching && !error) {
    setEditor({
      form: formFromLimits(state),
      baseline: {
        globalConcurrency: state.globalConcurrency,
        globalRateLimit: state.globalRateLimit,
      },
    })
  }
  const form = editor?.form ?? null
  const baseline = editor?.baseline ?? null

  const validation = useMemo(
    () => (form ? validateFlowControlsForm(form, baseline) : null),
    [form, baseline]
  )
  const update = useMemo(() => {
    if (!baseline || !validation?.limits) return null
    return diffFlowControls(baseline, validation.limits)
  }, [baseline, validation])
  const hasChanges = update !== null && Object.keys(update).length > 0
  const isSaving = updateMutation.isPending
  const canSave = hasChanges && !isSaving

  const patchForm = (patch: Partial<FlowControlsForm>) => {
    // Editing changes what Save would send, so its old failure no longer applies.
    setSaveError(null)
    setEditor((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev))
  }

  const handleSave = async () => {
    if (!update || !hasChanges) return
    setSaveError(null)
    try {
      await updateMutation.mutateAsync({ queueName, update })
      toast.success('Flow controls updated', {
        description: 'Workers apply the new limits the next time they fetch a job.',
      })
      onSaved()
    } catch (error) {
      // Keep the dialog and the edits; the shared handlers only surface 401/429.
      setSaveError(`Could not save the limits: ${errorMessage(error)}`)
    }
  }

  const handleClearWindow = async () => {
    setClearError(null)
    try {
      await clearMutation.mutateAsync(queueName)
      toast.success('Rate-limit window ended', {
        description:
          'Workers resume once their current back-off ends (30 seconds at most by default). The limit still applies.',
      })
    } catch (error) {
      setClearError(`Could not end the rate-limit window: ${errorMessage(error)}`)
    }
  }

  return {
    state,
    isLoading,
    error,
    form,
    validation,
    isSaving,
    canSave,
    isClearing: clearMutation.isPending,
    saveError,
    clearError,
    patchForm,
    handleSave,
    handleClearWindow,
  }
}

export function QueueFlowControlsDialog({
  queueName,
  open,
  onOpenChange,
}: QueueFlowControlsDialogProps) {
  const {
    state,
    isLoading,
    error,
    form,
    validation,
    isSaving,
    canSave,
    isClearing,
    saveError,
    clearError,
    patchForm,
    handleSave,
    handleClearWindow,
  } = useFlowControlsEditor({ queueName, open, onSaved: () => onOpenChange(false) })

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      trackEvent(AnalyticsEvents.DIALOG_CLOSED, {
        [AnalyticsProperties.DIALOG_TYPE]: DialogType.QUEUE_FLOW_CONTROLS,
      })
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Flow controls</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Queue-wide limits for <span className="font-mono text-foreground">{queueName}</span>,
            stored in Redis. Every worker applies them, so you can throttle a queue during an
            incident without a redeploy.
          </DialogDescription>
        </DialogHeader>

        {error && !form ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error.message}
          </p>
        ) : isLoading || !form || !state ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading flow controls" />
          </div>
        ) : (
          <div className="space-y-4">
            {error ? (
              // A failed poll keeps the edits on screen; only the live status may be stale.
              <p className="text-xs text-destructive">
                Could not refresh the live status: {error.message}
              </p>
            ) : null}
            <FlowControlsStatus
              state={state}
              onClearWindow={handleClearWindow}
              isClearing={isClearing}
            />
            <ConcurrencyFieldset
              form={form}
              error={validation?.concurrencyError ?? null}
              disabled={isSaving}
              onChange={patchForm}
            />
            <RateLimitFieldset
              form={form}
              maxError={validation?.rateLimitMaxError ?? null}
              durationError={validation?.rateLimitDurationError ?? null}
              disabled={isSaving}
              onChange={patchForm}
            />

            <p className="text-xs text-muted-foreground">
              Limits take effect the next time a worker fetches a job; running jobs are not
              interrupted. Workers on BullMQ releases without queue-level limits ignore them.
            </p>
          </div>
        )}

        <ActionError message={clearError} testId="flow-controls-clear-error" />
        <ActionError message={saveError} testId="flow-controls-save-error" />

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
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

function FlowControlsStatus({
  state,
  onClearWindow,
  isClearing,
}: {
  state: QueueFlowControlsResponse
  onClearWindow: () => void
  isClearing: boolean
}) {
  const concurrencyCap = state.globalConcurrency
  return (
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
              onClick={onClearWindow}
              disabled={isClearing}
            >
              {isClearing ? (
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
              No queue-wide rate-limit window is open
            </p>
          </>
        )}
      </div>
    </div>
  )
}

interface FieldsetProps {
  form: FlowControlsForm
  disabled: boolean
  onChange: (patch: Partial<FlowControlsForm>) => void
}

function ConcurrencyFieldset({
  form,
  error,
  disabled,
  onChange: patchForm,
}: FieldsetProps & { error: string | null }) {
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          checked={form.concurrencyEnabled}
          onChange={(event) => patchForm({ concurrencyEnabled: event.target.checked })}
          disabled={disabled}
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
              aria-invalid={error ? true : undefined}
              disabled={disabled}
              autoFocus
            />
            <span className="text-sm text-muted-foreground">jobs at a time</span>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </fieldset>
  )
}

function RateLimitFieldset({
  form,
  maxError,
  durationError,
  disabled,
  onChange: patchForm,
}: FieldsetProps & { maxError: string | null; durationError: string | null }) {
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          checked={form.rateLimitEnabled}
          onChange={(event) => patchForm({ rateLimitEnabled: event.target.checked })}
          disabled={disabled}
        />
        Rate limit job starts
      </label>
      <p className="text-xs text-muted-foreground">
        Maximum jobs started per time window across all workers. Use it to protect a downstream API
        with its own quota.
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
              aria-invalid={maxError ? true : undefined}
              disabled={disabled}
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
              aria-invalid={durationError ? true : undefined}
              disabled={disabled}
            />
            <Label htmlFor="flow-rate-unit" className="sr-only">
              Window unit
            </Label>
            <Select
              id="flow-rate-unit"
              className="h-8 w-32"
              value={form.rateLimitUnit}
              onChange={(event) => patchForm({ rateLimitUnit: event.target.value as DurationUnit })}
              disabled={disabled}
            >
              {DURATION_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>
          {maxError ? <p className="text-xs text-destructive">{maxError}</p> : null}
          {durationError ? <p className="text-xs text-destructive">{durationError}</p> : null}
        </div>
      ) : null}
    </fieldset>
  )
}

function ActionError({ message, testId }: { message: string | null; testId: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-destructive" data-testid={testId}>
      {message}
    </p>
  )
}

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type {
  BackoffMode,
  JobOptionsFormValue,
  JobOptionsValidationErrors,
  RetentionMode,
} from '@/lib/job-options'
import { cn } from '@/lib/utils'

const RETENTION_PRESETS = [25, 100, 500] as const

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return <p className="text-xs text-status-danger">{message}</p>
}

function RetentionControl({
  label,
  description,
  mode,
  countValue,
  onModeChange,
  onCountChange,
  error,
}: {
  label: string
  description: string
  mode: RetentionMode
  countValue: string
  onModeChange: (mode: RetentionMode) => void
  onCountChange: (value: string) => void
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px]">{label}</Label>
      <Select
        aria-label={label}
        value={mode}
        onChange={(event) => onModeChange(event.target.value as RetentionMode)}
      >
        <option value="keep">Keep all</option>
        <option value="remove">Remove immediately</option>
        <option value="count">Keep latest N</option>
      </Select>

      {mode === 'count' ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={countValue}
            onChange={(event) => onCountChange(event.target.value)}
            inputMode="numeric"
            placeholder="100"
            aria-label={`${label}: number of jobs to keep`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'w-24 font-mono tabular-nums',
              error && 'border-destructive focus-visible:ring-destructive'
            )}
          />
          {RETENTION_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="xs"
              aria-pressed={countValue === String(preset)}
              className={cn(
                'h-8 font-mono tabular-nums',
                countValue === String(preset) && 'bg-accent text-accent-foreground'
              )}
              onClick={() => onCountChange(String(preset))}
            >
              {preset}
            </Button>
          ))}
        </div>
      ) : null}
      <FieldMessage message={mode === 'count' ? error : undefined} />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

interface JobOptionsFieldsProps {
  value: JobOptionsFormValue
  onChange: (value: JobOptionsFormValue) => void
  errors?: JobOptionsValidationErrors
  showDelay?: boolean
  idPrefix?: string
  compact?: boolean
}

function updateField<K extends keyof JobOptionsFormValue>(
  value: JobOptionsFormValue,
  onChange: (value: JobOptionsFormValue) => void,
  field: K,
  nextValue: JobOptionsFormValue[K]
) {
  onChange({ ...value, [field]: nextValue })
}

export function JobOptionsFields({
  value,
  onChange,
  errors = {},
  showDelay = false,
  idPrefix = 'job-options',
  compact = false,
}: JobOptionsFieldsProps) {
  const gridClassName = compact
    ? 'grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4'
    : 'grid gap-x-3 gap-y-4 md:grid-cols-3'
  const invalidClass = 'border-destructive focus-visible:ring-destructive'

  return (
    <div className="space-y-4">
      <div className={gridClassName}>
        {showDelay ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-delay`} className="text-[13px]">
              Delay (ms)
            </Label>
            <Input
              id={`${idPrefix}-delay`}
              type="number"
              min="0"
              value={value.delay}
              onChange={(event) => updateField(value, onChange, 'delay', event.target.value)}
              placeholder="0"
              className={cn('font-mono tabular-nums', errors.delay && invalidClass)}
            />
            <FieldMessage message={errors.delay} />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-attempts`} className="text-[13px]">
            {compact ? 'Max attempts' : 'Attempts'}
          </Label>
          <Input
            id={`${idPrefix}-attempts`}
            value={value.attempts}
            onChange={(event) => updateField(value, onChange, 'attempts', event.target.value)}
            inputMode="numeric"
            min={compact ? '1' : undefined}
            className={cn('font-mono tabular-nums', errors.attempts && invalidClass)}
          />
          <FieldMessage message={errors.attempts} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-priority`} className="text-[13px]">
            Priority
          </Label>
          <Input
            id={`${idPrefix}-priority`}
            value={value.priority}
            onChange={(event) => updateField(value, onChange, 'priority', event.target.value)}
            inputMode="numeric"
            min={compact ? '0' : undefined}
            className={cn('font-mono tabular-nums', errors.priority && invalidClass)}
          />
          <FieldMessage message={errors.priority} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-backoff-type`} className="text-[13px]">
            Backoff
          </Label>
          <Select
            id={`${idPrefix}-backoff-type`}
            value={value.backoffMode}
            onChange={(event) =>
              updateField(value, onChange, 'backoffMode', event.target.value as BackoffMode)
            }
          >
            <option value="none">No backoff</option>
            <option value="fixed">Fixed</option>
            <option value="exponential">Exponential</option>
          </Select>
        </div>
      </div>

      {value.backoffMode !== 'none' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-backoff-delay`} className="text-[13px]">
            Backoff delay (ms)
          </Label>
          <Input
            id={`${idPrefix}-backoff-delay`}
            value={value.backoffDelay}
            onChange={(event) => updateField(value, onChange, 'backoffDelay', event.target.value)}
            inputMode="numeric"
            className={cn('font-mono tabular-nums sm:max-w-48', errors.backoff && invalidClass)}
          />
          <FieldMessage message={errors.backoff} />
        </div>
      ) : null}

      <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
        <RetentionControl
          label="Completed job retention"
          description="Keep history for successful runs or trim it automatically."
          mode={value.removeOnCompleteMode}
          countValue={value.removeOnCompleteCount}
          onModeChange={(mode) => updateField(value, onChange, 'removeOnCompleteMode', mode)}
          onCountChange={(count) => updateField(value, onChange, 'removeOnCompleteCount', count)}
          error={errors.removeOnComplete}
        />
        <RetentionControl
          label="Failed job retention"
          description="Control how much failed-run history stays available for debugging."
          mode={value.removeOnFailMode}
          countValue={value.removeOnFailCount}
          onModeChange={(mode) => updateField(value, onChange, 'removeOnFailMode', mode)}
          onCountChange={(count) => updateField(value, onChange, 'removeOnFailCount', count)}
          error={errors.removeOnFail}
        />
      </div>
    </div>
  )
}

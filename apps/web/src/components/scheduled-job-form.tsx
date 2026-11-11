import { CalendarClock, Loader2, Repeat } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { JobOptionsFields } from '@/components/job-options-fields'
import { JsonEditor } from '@/components/json-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Metric, MetricStrip } from '@/components/ui/metric'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  ScheduledJobMutationInput,
  ScheduledJobTemplateOptionsInput,
} from '@/hooks/use-queues'
import {
  createDefaultJobOptionsFormValue,
  formValueToTemplateOptions,
  hasJobOptionsValidationErrors,
  type JobOptionsFormValue,
  parseOptionalWholeNumber,
  templateOptionsToFormValue,
  validateJobOptionsFormValue,
} from '@/lib/job-options'
import {
  formatScheduleTimeZone,
  fromDateTimeLocalValue,
  getCronDescription,
  getScheduleExpression,
  getScheduleSummary,
  getTimeZoneOptions,
  isValidSchedulerId,
  isValidTimeZone,
  slugifySchedulerId,
  toDateTimeLocalValue,
} from '@/lib/scheduled-jobs'
import { cn, formatDate, formatDateWithTimezone } from '@/lib/utils'

type ScheduleMode = 'cron' | 'every'

export interface ScheduledJobFormInitialValue {
  schedulerId: string
  jobName: string
  data?: unknown
  pattern?: string
  every?: number
  timezone?: string
  startDate?: number
  endDate?: number
  limit?: number
  templateOptions?: ScheduledJobTemplateOptionsInput
  nextRun?: number
  iterationCount?: number
  recentFailedCount?: number
  lastFailedAt?: number
}

interface ScheduledJobFormProps {
  mode: 'create' | 'edit'
  queueName: string
  existingSchedulerIds?: string[]
  initialValue?: ScheduledJobFormInitialValue
  isSubmitting?: boolean
  onSubmit: (payload: Omit<ScheduledJobMutationInput, 'queueName'>) => Promise<void> | void
  onCancel: () => void
}

const CRON_PRESETS = [
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily 9 AM', value: '0 9 * * *' },
  { label: 'Weekdays 9 AM', value: '0 9 * * 1-5' },
] as const

const EVERY_PRESETS = [
  { label: '30 sec', value: '30000' },
  { label: '5 min', value: '300000' },
  { label: '15 min', value: '900000' },
  { label: '1 hour', value: '3600000' },
] as const

const FIELD = 'space-y-1.5'
const LABEL = 'block text-[13px] font-medium leading-5'
const HELP = 'text-xs text-muted-foreground'
const INVALID =
  'border-status-danger hover:border-status-danger focus-visible:border-status-danger focus-visible:ring-status-danger/25'

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return <p className="text-xs text-status-danger">{message}</p>
}

function formatShortDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ScheduledJobForm({
  mode,
  queueName,
  existingSchedulerIds = [],
  initialValue,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: ScheduledJobFormProps) {
  const browserTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  )
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), [])
  // An existing cron scheduler saved without a timezone runs in the worker
  // host's timezone. Editing it must keep that unless the user picks one:
  // falling back to the browser's timezone here would silently move the schedule.
  const storedWithoutTimeZone =
    mode === 'edit' && Boolean(initialValue?.pattern) && !initialValue?.timezone

  const [jobName, setJobName] = useState('')
  const [schedulerId, setSchedulerId] = useState('')
  const [hasEditedSchedulerId, setHasEditedSchedulerId] = useState(false)
  const [jobData, setJobData] = useState<unknown>({})
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('cron')
  const [cronPattern, setCronPattern] = useState('0 * * * *')
  const [everyMs, setEveryMs] = useState('900000')
  const [timeZone, setTimeZone] = useState(browserTimeZone)
  const [runImmediately, setRunImmediately] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [limit, setLimit] = useState('')
  const [jobOptions, setJobOptions] = useState<JobOptionsFormValue>(
    createDefaultJobOptionsFormValue()
  )

  useEffect(() => {
    if (mode === 'edit' && !initialValue) {
      return
    }

    const isEdit = mode === 'edit' && initialValue
    const scheduleIsCron = isEdit ? Boolean(initialValue.pattern) : true
    const templateOptions = initialValue?.templateOptions

    setJobName(initialValue?.jobName ?? '')
    setSchedulerId(initialValue?.schedulerId ?? '')
    setHasEditedSchedulerId(Boolean(isEdit))
    setJobData(initialValue?.data ?? {})
    setIsJsonValid(true)
    setScheduleMode(scheduleIsCron ? 'cron' : 'every')
    setCronPattern(initialValue?.pattern ?? '0 * * * *')
    setEveryMs(initialValue?.every ? String(initialValue.every) : '900000')
    setTimeZone(initialValue?.timezone ?? (isEdit && scheduleIsCron ? '' : browserTimeZone))
    setRunImmediately(false)
    setStartDate(toDateTimeLocalValue(initialValue?.startDate))
    setEndDate(toDateTimeLocalValue(initialValue?.endDate))
    setLimit(initialValue?.limit ? String(initialValue.limit) : '')
    setJobOptions({
      ...createDefaultJobOptionsFormValue(),
      ...templateOptionsToFormValue(templateOptions),
    })
  }, [browserTimeZone, initialValue, mode])

  useEffect(() => {
    if (mode !== 'create' || hasEditedSchedulerId) {
      return
    }

    setSchedulerId(slugifySchedulerId(jobName))
  }, [hasEditedSchedulerId, jobName, mode])

  const existingSchedulerIdSet = useMemo(() => {
    const next = new Set(existingSchedulerIds)
    if (mode === 'edit' && initialValue?.schedulerId) {
      next.delete(initialValue.schedulerId)
    }
    return next
  }, [existingSchedulerIds, initialValue?.schedulerId, mode])

  const handleJsonChange = (value: unknown, valid: boolean) => {
    setJobData(value)
    setIsJsonValid(valid)
  }

  const scheduleSummary = useMemo(
    () =>
      scheduleMode === 'cron'
        ? getScheduleSummary({ pattern: cronPattern })
        : getScheduleSummary({ every: parseOptionalWholeNumber(everyMs) }),
    [cronPattern, everyMs, scheduleMode]
  )

  const schedulerIdError = useMemo(() => {
    const normalized = schedulerId.trim()
    if (!normalized) {
      return 'Scheduler ID is required.'
    }
    if (!isValidSchedulerId(normalized)) {
      return 'Use only letters, numbers, colon, underscore, dash, and dot.'
    }
    if (existingSchedulerIdSet.has(normalized)) {
      return 'That scheduler ID already exists in this queue.'
    }
    return undefined
  }, [existingSchedulerIdSet, schedulerId])

  const cronError = useMemo(() => {
    if (scheduleMode !== 'cron') {
      return undefined
    }
    return getCronDescription(cronPattern) === 'Invalid cron pattern'
      ? 'Enter a valid cron expression.'
      : undefined
  }, [cronPattern, scheduleMode])

  const everyValue = useMemo(() => parseOptionalWholeNumber(everyMs), [everyMs])
  const everyError = useMemo(() => {
    if (scheduleMode !== 'every') {
      return undefined
    }
    if (everyValue === undefined) {
      return 'Enter an interval in milliseconds.'
    }
    if (everyValue < 1000) {
      return 'Intervals must be at least 1000 ms.'
    }
    return undefined
  }, [everyValue, scheduleMode])

  const timeZoneError = useMemo(() => {
    if (scheduleMode !== 'cron') {
      return undefined
    }
    if (!timeZone.trim()) {
      return storedWithoutTimeZone ? undefined : 'Timezone is required for cron schedules.'
    }
    return isValidTimeZone(timeZone.trim())
      ? undefined
      : 'Choose a valid IANA timezone such as America/Los_Angeles.'
  }, [scheduleMode, storedWithoutTimeZone, timeZone])

  const startDateIso = useMemo(() => fromDateTimeLocalValue(startDate), [startDate])
  const endDateIso = useMemo(() => fromDateTimeLocalValue(endDate), [endDate])
  const startTimestamp = startDateIso ? Date.parse(startDateIso) : undefined
  const endTimestamp = endDateIso ? Date.parse(endDateIso) : undefined

  const dateWindowError = useMemo(() => {
    if (startDate && !startDateIso) {
      return 'Start date must be valid.'
    }
    if (endDate && !endDateIso) {
      return 'End date must be valid.'
    }
    if (
      startTimestamp !== undefined &&
      endTimestamp !== undefined &&
      endTimestamp <= startTimestamp
    ) {
      return 'End date must be later than the start date.'
    }
    return undefined
  }, [endDate, endDateIso, endTimestamp, startDate, startDateIso, startTimestamp])

  const limitValue = useMemo(() => parseOptionalWholeNumber(limit), [limit])
  const limitError = useMemo(() => {
    if (!limit.trim()) {
      return undefined
    }
    if (limitValue === undefined || limitValue < 1) {
      return 'Limit must be a whole number greater than 0.'
    }
    return undefined
  }, [limit, limitValue])

  const jobOptionsErrors = useMemo(() => validateJobOptionsFormValue(jobOptions), [jobOptions])

  const canSubmit =
    isJsonValid &&
    !schedulerIdError &&
    !cronError &&
    !everyError &&
    !timeZoneError &&
    !dateWindowError &&
    !limitError &&
    !hasJobOptionsValidationErrors(jobOptionsErrors) &&
    jobName.trim().length > 0 &&
    !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }

    const options = formValueToTemplateOptions(jobOptions)

    await onSubmit({
      schedulerId: schedulerId.trim(),
      name: jobName.trim(),
      data: jobData,
      schedule:
        scheduleMode === 'cron'
          ? {
              type: 'cron',
              pattern: cronPattern.trim(),
              // Omitted when none is stored, so the scheduler keeps running on host time.
              timezone: timeZone.trim() || undefined,
              immediately: mode === 'create' ? runImmediately : false,
              startDate: startDateIso,
              endDate: endDateIso,
              limit: limitValue,
            }
          : {
              type: 'every',
              everyMs: everyValue!,
              startDate: startDateIso,
              endDate: endDateIso,
              limit: limitValue,
            },
      options,
    })
  }

  const nameMissing = jobName.trim().length === 0
  const blockingReason = nameMissing
    ? 'Enter a job name to continue.'
    : (schedulerIdError ??
      cronError ??
      everyError ??
      timeZoneError ??
      dateWindowError ??
      limitError ??
      (!isJsonValid
        ? 'Payload must be valid JSON.'
        : hasJobOptionsValidationErrors(jobOptionsErrors)
          ? 'Fix the highlighted job options.'
          : undefined))

  const scheduleExpression = getScheduleExpression({
    pattern: scheduleMode === 'cron' ? cronPattern : undefined,
    every: scheduleMode === 'every' ? everyValue : undefined,
  })
  const scheduleIsValid = scheduleMode === 'cron' ? !cronError : !everyError
  const recentFailedCount = initialValue?.recentFailedCount ?? 0

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 pb-4">
        {mode === 'edit' && initialValue ? (
          <MetricStrip>
            <Metric
              label="Next run"
              className="col-span-2 sm:col-span-1"
              value={initialValue.nextRun ? formatShortDateTime(initialValue.nextRun) : '—'}
              title={
                initialValue.nextRun ? formatDateWithTimezone(initialValue.nextRun) : undefined
              }
            />
            <Metric
              label="Iterations"
              value={
                typeof initialValue.iterationCount === 'number'
                  ? initialValue.iterationCount.toLocaleString()
                  : '—'
              }
            />
            <Metric
              label="Recent failures"
              value={recentFailedCount}
              tone={recentFailedCount > 0 ? 'danger' : 'neutral'}
              emphasis={recentFailedCount > 0}
              hint={
                initialValue.lastFailedAt
                  ? `last ${formatShortDateTime(initialValue.lastFailedAt)}`
                  : undefined
              }
              title={
                initialValue.lastFailedAt
                  ? `Last failure: ${formatDate(initialValue.lastFailedAt)}`
                  : undefined
              }
            />
          </MetricStrip>
        ) : null}

        <Panel>
          <PanelHeader>
            <h2 className="text-sm font-semibold tracking-tight">What runs</h2>
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              Queue
              <Badge variant="neutral" className="min-w-0 font-mono">
                <span className="truncate">{queueName}</span>
              </Badge>
            </span>
          </PanelHeader>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className={FIELD}>
                <Label htmlFor="scheduled-job-name" className={LABEL}>
                  Job name
                </Label>
                <Input
                  id="scheduled-job-name"
                  value={jobName}
                  onChange={(event) => setJobName(event.target.value)}
                  placeholder="send-daily-digest"
                  className="font-mono"
                />
                <p className={HELP}>The name your worker's processor receives.</p>
              </div>

              <div className={FIELD}>
                <Label htmlFor="scheduled-job-scheduler-id" className={LABEL}>
                  Scheduler ID
                </Label>
                <Input
                  id="scheduled-job-scheduler-id"
                  value={schedulerId}
                  onChange={(event) => {
                    setHasEditedSchedulerId(true)
                    setSchedulerId(event.target.value)
                  }}
                  disabled={mode === 'edit'}
                  placeholder="send-daily-digest-prod"
                  aria-invalid={schedulerIdError ? true : undefined}
                  className={cn('font-mono', schedulerIdError && INVALID)}
                />
                <FieldMessage message={schedulerIdError} />
                <p className={HELP}>
                  {mode === 'create'
                    ? 'Stable and descriptive, like billing-hourly. Locked after creation.'
                    : 'Locked after creation so BullMQ references stay stable.'}
                </p>
              </div>
            </div>

            <div className={FIELD}>
              <div className={LABEL}>Payload</div>
              <JsonEditor
                value={jobData}
                onChange={handleJsonChange}
                minHeight="160px"
                className="[&_.cm-editor]:max-h-[320px] [&_.cm-scroller]:overflow-auto"
              />
              <p className={HELP}>JSON passed as the data of every run.</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="text-sm font-semibold tracking-tight">When</h2>
            <Tabs
              value={scheduleMode}
              onValueChange={(next) => setScheduleMode(next as ScheduleMode)}
            >
              <TabsList role="group" aria-label="Schedule type">
                <TabsTrigger value="cron" aria-pressed={scheduleMode === 'cron'}>
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  Cron schedule
                </TabsTrigger>
                <TabsTrigger value="every" aria-pressed={scheduleMode === 'every'}>
                  <Repeat className="h-3.5 w-3.5" aria-hidden />
                  Fixed interval
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </PanelHeader>

          <div className="space-y-4 p-4">
            {scheduleMode === 'cron' ? (
              <>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className={FIELD}>
                    <Label htmlFor="scheduled-job-pattern" className={LABEL}>
                      Cron pattern
                    </Label>
                    <Input
                      id="scheduled-job-pattern"
                      value={cronPattern}
                      onChange={(event) => setCronPattern(event.target.value)}
                      placeholder="0 * * * *"
                      aria-invalid={cronError ? true : undefined}
                      className={cn('font-mono', cronError && INVALID)}
                    />
                    <FieldMessage message={cronError} />
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {CRON_PRESETS.map((preset) => (
                        <Button
                          key={preset.value}
                          type="button"
                          size="xs"
                          variant={cronPattern === preset.value ? 'secondary' : 'outline'}
                          aria-pressed={cronPattern === preset.value}
                          onClick={() => setCronPattern(preset.value)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className={FIELD}>
                    <Label htmlFor="scheduled-job-timezone" className={LABEL}>
                      Timezone
                    </Label>
                    <Select
                      id="scheduled-job-timezone"
                      value={timeZone}
                      onChange={(event) => setTimeZone(event.target.value)}
                    >
                      {storedWithoutTimeZone ? (
                        <option value="">Not set (worker host time)</option>
                      ) : null}
                      {timeZoneOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === browserTimeZone ? `${option} (browser)` : option}
                        </option>
                      ))}
                    </Select>
                    {storedWithoutTimeZone && !timeZone ? (
                      <p className={HELP}>
                        No timezone is stored, so BullMQ evaluates this pattern in the worker
                        host&apos;s timezone (usually UTC). Choose one to pin it.
                      </p>
                    ) : null}
                    <FieldMessage message={timeZoneError} />
                  </div>
                </div>

                <label
                  htmlFor="scheduled-job-immediately"
                  className={cn(
                    'flex w-fit items-start gap-2.5',
                    mode === 'edit' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  )}
                >
                  <input
                    id="scheduled-job-immediately"
                    type="checkbox"
                    checked={runImmediately}
                    onChange={(event) => setRunImmediately(event.target.checked)}
                    disabled={mode === 'edit'}
                    className="mt-0.5 h-4 w-4 rounded-sm border-input accent-primary"
                  />
                  <span>
                    <span className="block text-[13px] font-medium leading-5">
                      Run immediately after creation
                    </span>
                    <span className={cn(HELP, 'block')}>
                      {mode === 'edit'
                        ? 'Only applies when a schedule is first created.'
                        : 'Enqueue the first run right away, then continue on the cron cadence.'}
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <div className={cn(FIELD, 'md:max-w-sm')}>
                <Label htmlFor="scheduled-job-every" className={LABEL}>
                  Interval (ms)
                </Label>
                <Input
                  id="scheduled-job-every"
                  value={everyMs}
                  onChange={(event) => setEveryMs(event.target.value)}
                  inputMode="numeric"
                  placeholder="900000"
                  aria-invalid={everyError ? true : undefined}
                  className={cn('font-mono', everyError && INVALID)}
                />
                <FieldMessage message={everyError} />
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {EVERY_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      size="xs"
                      variant={everyMs === preset.value ? 'secondary' : 'outline'}
                      aria-pressed={everyMs === preset.value}
                      onClick={() => setEveryMs(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 border-t pt-4 md:grid-cols-3">
              <div className={FIELD}>
                <Label htmlFor="scheduled-job-start-date" className={LABEL}>
                  Start date
                </Label>
                <Input
                  id="scheduled-job-start-date"
                  type="datetime-local"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>

              <div className={FIELD}>
                <Label htmlFor="scheduled-job-end-date" className={LABEL}>
                  End date
                </Label>
                <Input
                  id="scheduled-job-end-date"
                  type="datetime-local"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-invalid={dateWindowError ? true : undefined}
                  className={dateWindowError ? INVALID : undefined}
                />
              </div>

              <div className={FIELD}>
                <Label htmlFor="scheduled-job-limit" className={LABEL}>
                  Run limit
                </Label>
                <Input
                  id="scheduled-job-limit"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  inputMode="numeric"
                  placeholder="No limit"
                  aria-invalid={limitError ? true : undefined}
                  className={cn('font-mono', limitError && INVALID)}
                />
              </div>

              {(dateWindowError ?? limitError) ? (
                <div className="md:col-span-3">
                  <FieldMessage message={dateWindowError ?? limitError} />
                </div>
              ) : (
                <p className={cn(HELP, 'md:col-span-3')}>
                  Optional. Leave empty to start now and run until removed.
                </p>
              )}
            </div>
          </div>

          <div
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t bg-muted/40 px-4 py-2.5 text-[13px]"
            aria-live="polite"
          >
            <span className="eyebrow">Runs</span>
            <span className={cn('font-medium', !scheduleIsValid && 'text-status-danger')}>
              {scheduleSummary}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {scheduleExpression}
              {scheduleMode === 'cron' ? ` · ${formatScheduleTimeZone(timeZone)}` : ''}
            </span>
            {startTimestamp ? (
              <span className="text-xs text-muted-foreground">
                from <span className="font-mono">{formatShortDateTime(startTimestamp)}</span>
              </span>
            ) : null}
            {endTimestamp ? (
              <span className="text-xs text-muted-foreground">
                until <span className="font-mono">{formatShortDateTime(endTimestamp)}</span>
              </span>
            ) : null}
            {typeof limitValue === 'number' && !limitError ? (
              <span className="text-xs text-muted-foreground">
                at most <span className="font-mono">{limitValue.toLocaleString()}</span>{' '}
                {limitValue === 1 ? 'run' : 'runs'}
              </span>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2 className="text-sm font-semibold tracking-tight">Options</h2>
            <span className="text-xs text-muted-foreground">Applied to every job it creates</span>
          </PanelHeader>
          <div className="p-4">
            <JobOptionsFields
              value={jobOptions}
              onChange={setJobOptions}
              errors={jobOptionsErrors}
              idPrefix="scheduled-job"
            />
          </div>
        </Panel>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background/95 px-4 backdrop-blur md:-mx-5 md:-mb-5 md:px-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 py-2.5">
          <p
            className={cn(
              'min-w-0 truncate text-xs',
              blockingReason && !nameMissing && !isSubmitting
                ? 'text-status-danger'
                : 'text-muted-foreground'
            )}
            aria-live="polite"
          >
            {blockingReason && !isSubmitting
              ? blockingReason
              : mode === 'create'
                ? `Creates a scheduler on ${queueName}.`
                : 'Saved changes apply to the next run.'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : mode === 'create' ? (
                'Create scheduled job'
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

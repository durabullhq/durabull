import {
  CalendarClock,
  Clock3,
  Loader2,
  PencilLine,
  Repeat,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { JsonEditor } from '@/components/json-editor'
import { JobOptionsFields } from '@/components/job-options-fields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type {
  ScheduledJobMutationInput,
  ScheduledJobTemplateOptionsInput,
} from '@/hooks/use-queues'
import {
  createDefaultJobOptionsFormValue,
  formValueToTemplateOptions,
  hasJobOptionsValidationErrors,
  parseOptionalWholeNumber,
  templateOptionsToFormValue,
  validateJobOptionsFormValue,
  type JobOptionsFormValue,
} from '@/lib/job-options'
import {
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
import { cn, formatDate } from '@/lib/utils'

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

function FieldMessage({ message }: { message?: string }) {
  if (!message) {
    return null
  }

  return <p className="text-xs text-destructive">{message}</p>
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
    setTimeZone(initialValue?.timezone ?? browserTimeZone)
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
      return 'Timezone is required for cron schedules.'
    }
    return isValidTimeZone(timeZone.trim())
      ? undefined
      : 'Choose a valid IANA timezone such as America/Los_Angeles.'
  }, [scheduleMode, timeZone])

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
              timezone: timeZone.trim(),
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

  return (
    <div className="space-y-6 pb-28">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.14),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0))]">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <Badge variant="outline" className="w-fit">
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                    {mode === 'create' ? 'New scheduler' : 'Edit scheduler'}
                  </Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-xl md:text-2xl">
                      {mode === 'create'
                        ? 'Add a scheduled job'
                        : `Edit ${initialValue?.jobName ?? 'scheduled job'}`}
                    </CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-6">
                      Configure cadence, payload, and delivery behavior for queue{' '}
                      <span className="font-mono text-foreground">{queueName}</span>. This page is
                      designed for deliberate scheduling work, not a quick modal.
                    </CardDescription>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/40 bg-background/80 px-4 py-3 shadow-sm backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Queue Target
                  </div>
                  <div className="mt-1 font-mono text-sm text-foreground">{queueName}</div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity</CardTitle>
              <CardDescription>
                Choose the worker-facing job name and the scheduler identity BullMQ will track over
                time.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scheduled-job-name">Job Name</Label>
                <Input
                  id="scheduled-job-name"
                  value={jobName}
                  onChange={(event) => setJobName(event.target.value)}
                  placeholder="send-daily-digest"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled-job-scheduler-id">Scheduler ID</Label>
                <Input
                  id="scheduled-job-scheduler-id"
                  value={schedulerId}
                  onChange={(event) => {
                    setHasEditedSchedulerId(true)
                    setSchedulerId(event.target.value)
                  }}
                  disabled={mode === 'edit'}
                  placeholder="send-daily-digest-prod"
                  className={
                    schedulerIdError
                      ? 'border-destructive focus-visible:ring-destructive'
                      : undefined
                  }
                />
                <FieldMessage message={schedulerIdError} />
                <p className="text-xs text-muted-foreground">
                  {mode === 'create'
                    ? 'Good IDs are stable and descriptive, like billing-hourly.'
                    : 'Scheduler IDs stay locked after creation so audit trails and BullMQ references remain stable.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cadence</CardTitle>
              <CardDescription>
                Choose between cron syntax for calendar schedules or a fixed millisecond interval.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode('cron')}
                  className={cn(
                    'rounded-xl border px-4 py-4 text-left transition-colors',
                    scheduleMode === 'cron'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/70 hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="h-4 w-4" />
                    Cron schedule
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Best for “every weekday at 9 AM” or “first of the month”.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleMode('every')}
                  className={cn(
                    'rounded-xl border px-4 py-4 text-left transition-colors',
                    scheduleMode === 'every'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/70 hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Repeat className="h-4 w-4" />
                    Fixed interval
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Best for “every 5 minutes” or “every 30 seconds”.
                  </p>
                </button>
              </div>

              {scheduleMode === 'cron' ? (
                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/15 p-4">
                  <div className="flex flex-wrap gap-2">
                    {CRON_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        size="xs"
                        variant={cronPattern === preset.value ? 'secondary' : 'outline'}
                        onClick={() => setCronPattern(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1.5fr,1fr]">
                    <div className="space-y-2">
                      <Label htmlFor="scheduled-job-pattern">Cron Pattern</Label>
                      <Input
                        id="scheduled-job-pattern"
                        value={cronPattern}
                        onChange={(event) => setCronPattern(event.target.value)}
                        placeholder="0 * * * *"
                        className={
                          cronError
                            ? 'border-destructive focus-visible:ring-destructive'
                            : undefined
                        }
                      />
                      <FieldMessage message={cronError} />
                      <p className="text-xs text-muted-foreground">{scheduleSummary}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scheduled-job-timezone">Timezone</Label>
                      <Select
                        id="scheduled-job-timezone"
                        value={timeZone}
                        onChange={(event) => setTimeZone(event.target.value)}
                      >
                        {timeZoneOptions.map((option) => (
                          <option key={option} value={option}>
                            {option === browserTimeZone ? `${option} (browser)` : option}
                          </option>
                        ))}
                      </Select>
                      <FieldMessage message={timeZoneError} />
                    </div>
                  </div>

                  <label
                    htmlFor="scheduled-job-immediately"
                    className={cn(
                      'flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-3',
                      mode === 'edit' && 'opacity-70'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">Run immediately after creation</p>
                      <p className="text-xs text-muted-foreground">
                        Enqueue the first run right away, then continue on the cron cadence.
                      </p>
                    </div>
                    <input
                      id="scheduled-job-immediately"
                      type="checkbox"
                      checked={runImmediately}
                      onChange={(event) => setRunImmediately(event.target.checked)}
                      disabled={mode === 'edit'}
                      className="rounded border-gray-300"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/15 p-4">
                  <div className="flex flex-wrap gap-2">
                    {EVERY_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        size="xs"
                        variant={everyMs === preset.value ? 'secondary' : 'outline'}
                        onClick={() => setEveryMs(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduled-job-every">Interval (ms)</Label>
                    <Input
                      id="scheduled-job-every"
                      value={everyMs}
                      onChange={(event) => setEveryMs(event.target.value)}
                      inputMode="numeric"
                      placeholder="900000"
                      className={
                        everyError ? 'border-destructive focus-visible:ring-destructive' : undefined
                      }
                    />
                    <FieldMessage message={everyError} />
                    <p className="text-xs text-muted-foreground">{scheduleSummary}</p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="scheduled-job-start-date">Start Date</Label>
                  <Input
                    id="scheduled-job-start-date"
                    type="datetime-local"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled-job-end-date">End Date</Label>
                  <Input
                    id="scheduled-job-end-date"
                    type="datetime-local"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={
                      dateWindowError
                        ? 'border-destructive focus-visible:ring-destructive'
                        : undefined
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled-job-limit">Run Limit</Label>
                  <Input
                    id="scheduled-job-limit"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    inputMode="numeric"
                    placeholder="Optional"
                    className={
                      limitError ? 'border-destructive focus-visible:ring-destructive' : undefined
                    }
                  />
                </div>
              </div>

              <FieldMessage message={dateWindowError ?? limitError} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payload</CardTitle>
              <CardDescription>
                Define the JSON payload every scheduled run should enqueue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonEditor value={jobData} onChange={handleJsonChange} minHeight="260px" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Options</CardTitle>
              <CardDescription>
                Tune retry behavior, priority, and retention for the jobs created by this scheduler.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <JobOptionsFields
                value={jobOptions}
                onChange={setJobOptions}
                errors={jobOptionsErrors}
                idPrefix="scheduled-job"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="border-border/70 bg-gradient-to-br from-background to-muted/35">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                {mode === 'create' ? (
                  <Sparkles className="h-4 w-4 text-status-warning" />
                ) : (
                  <PencilLine className="h-4 w-4 text-status-active" />
                )}
                Scheduler Preview
              </CardTitle>
              <CardDescription>Live summary of the schedule you are configuring.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-background/85 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Summary
                </div>
                <div className="mt-2 text-base font-semibold">{scheduleSummary}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    {scheduleMode === 'cron' ? 'Cron' : 'Interval'}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    {getScheduleExpression({
                      pattern: scheduleMode === 'cron' ? cronPattern : undefined,
                      every: scheduleMode === 'every' ? everyValue : undefined,
                    })}
                  </span>
                  {scheduleMode === 'cron' ? (
                    <span className="rounded-full bg-muted px-2.5 py-1">{timeZone}</span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="font-medium text-foreground">Target job</div>
                      <div className="text-muted-foreground">
                        {jobName.trim() || 'Not named yet'}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Scheduler ID</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {schedulerId.trim() || 'pending-id'}
                      </div>
                    </div>
                    {startDate ? (
                      <div>
                        <div className="font-medium text-foreground">Starts</div>
                        <div className="text-muted-foreground">
                          {startTimestamp ? formatDate(startTimestamp) : startDate}
                        </div>
                      </div>
                    ) : null}
                    {endDate ? (
                      <div>
                        <div className="font-medium text-foreground">Ends</div>
                        <div className="text-muted-foreground">
                          {endTimestamp ? formatDate(endTimestamp) : endDate}
                        </div>
                      </div>
                    ) : null}
                    {typeof limitValue === 'number' ? (
                      <div>
                        <div className="font-medium text-foreground">Run limit</div>
                        <div className="text-muted-foreground">{limitValue} total runs</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {mode === 'edit' && initialValue ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4 text-sm">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <ShieldCheck className="h-4 w-4 text-status-success" />
                    Existing scheduler state
                  </div>
                  <div className="space-y-2 text-muted-foreground">
                    <div>
                      Next run: {initialValue.nextRun ? formatDate(initialValue.nextRun) : '—'}
                    </div>
                    <div>
                      Iterations:{' '}
                      {typeof initialValue.iterationCount === 'number'
                        ? initialValue.iterationCount
                        : '—'}
                    </div>
                    <div>Recent failures: {initialValue.recentFailedCount ?? 0}</div>
                    {initialValue.lastFailedAt ? (
                      <div>Last failure: {formatDate(initialValue.lastFailedAt)}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[min(1200px,calc(100vw-2rem))] items-center justify-between gap-3 px-4 py-3">
          <div className="text-sm text-muted-foreground">
            {mode === 'create'
              ? 'Create a scheduler that your team can audit and refine later.'
              : 'Changes are applied directly to the existing BullMQ scheduler.'}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {mode === 'create' ? 'Create Scheduled Job' : 'Save Changes'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

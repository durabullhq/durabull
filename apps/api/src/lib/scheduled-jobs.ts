import type { JobSchedulerJson, RepeatOptions } from 'bullmq'
import { z } from 'zod'
import { optionalJobTemplateOptionsSchema, type JobTemplateOptionsInput } from './job-options'

const MAX_SCHEDULER_ID_LENGTH = 128
const MAX_JOB_NAME_LENGTH = 120
const MAX_SCHEDULE_LIMIT = 1_000_000
const MIN_EVERY_MS = 1_000
const MAX_EVERY_MS = 365 * 24 * 60 * 60 * 1000
const SCHEDULER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/

const timestampInputSchema = z.union([z.string(), z.number().int().safe()])

const scheduleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cron'),
    pattern: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(100).optional(),
    immediately: z.boolean().default(false),
    startDate: timestampInputSchema.optional(),
    endDate: timestampInputSchema.optional(),
    limit: z.number().int().min(1).max(MAX_SCHEDULE_LIMIT).optional(),
  }),
  z.object({
    type: z.literal('every'),
    everyMs: z.number().int().min(MIN_EVERY_MS).max(MAX_EVERY_MS),
    startDate: timestampInputSchema.optional(),
    endDate: timestampInputSchema.optional(),
    limit: z.number().int().min(1).max(MAX_SCHEDULE_LIMIT).optional(),
  }),
])

const scheduledJobPayloadSchema = z.object({
  name: z.string().trim().min(1, 'Job name is required.').max(MAX_JOB_NAME_LENGTH),
  data: z.unknown().default({}),
  schedule: scheduleSchema,
  options: optionalJobTemplateOptionsSchema,
})

function validateScheduledJobPayload(
  value: z.infer<typeof scheduledJobPayloadSchema>,
  ctx: z.RefinementCtx
) {
  const startDate = parseOptionalTimestamp(value.schedule.startDate)
  const endDate = parseOptionalTimestamp(value.schedule.endDate)

  if (value.schedule.startDate !== undefined && startDate === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Start date must be a valid timestamp or ISO date string.',
      path: ['schedule', 'startDate'],
    })
  }

  if (value.schedule.endDate !== undefined && endDate === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be a valid timestamp or ISO date string.',
      path: ['schedule', 'endDate'],
    })
  }

  if (startDate !== undefined && endDate !== undefined && endDate <= startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be later than the start date.',
      path: ['schedule', 'endDate'],
    })
  }

  if (
    value.schedule.type === 'cron' &&
    value.schedule.timezone &&
    !isValidTimeZone(value.schedule.timezone)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Timezone must be a valid IANA timezone such as America/Los_Angeles.',
      path: ['schedule', 'timezone'],
    })
  }
}

export const createScheduledJobSchema = scheduledJobPayloadSchema
  .extend({
    schedulerId: z
      .string()
      .trim()
      .min(1, 'Scheduler ID is required.')
      .max(MAX_SCHEDULER_ID_LENGTH)
      .regex(
        SCHEDULER_ID_PATTERN,
        'Scheduler ID may contain letters, numbers, colon, underscore, dash, and dot.'
      ),
  })
  .superRefine(validateScheduledJobPayload)

export const updateScheduledJobSchema = scheduledJobPayloadSchema.superRefine(
  validateScheduledJobPayload
)

export type CreateScheduledJobInput = z.infer<typeof createScheduledJobSchema>
export type UpdateScheduledJobInput = z.infer<typeof updateScheduledJobSchema>

export type ScheduledJobTemplateOptions = JobTemplateOptionsInput

export interface ScheduledJobSummary {
  schedulerId: string
  pattern?: string
  every?: number
  queueName: string
  jobName: string
  nextRun?: number
  enabled: boolean
  data?: unknown
  templateOptions?: ScheduledJobTemplateOptions
  timezone?: string
  startDate?: number
  endDate?: number
  limit?: number
  iterationCount?: number
  recentFailedCount: number
  lastFailedAt?: number
}

export function parseOptionalTimestamp(input: string | number | undefined): number | undefined {
  if (input === undefined) {
    return undefined
  }

  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : undefined
  }

  const value = input.trim()
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === 'UTC') {
    return true
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function toScheduledJobMutationInput(
  schedulerId: string,
  input: Omit<CreateScheduledJobInput, 'schedulerId'>
): {
  schedulerId: string
  jobName: string
  jobData: unknown
  repeatOptions: Omit<RepeatOptions, 'key'>
  templateOptions?: ScheduledJobTemplateOptions
} {
  const startDate = parseOptionalTimestamp(input.schedule.startDate)
  const endDate = parseOptionalTimestamp(input.schedule.endDate)

  const repeatOptions: Omit<RepeatOptions, 'key'> =
    input.schedule.type === 'cron'
      ? {
          pattern: input.schedule.pattern,
          tz: input.schedule.timezone,
          startDate,
          endDate,
          limit: input.schedule.limit,
          immediately: input.schedule.immediately,
        }
      : {
          every: input.schedule.everyMs,
          startDate,
          endDate,
          limit: input.schedule.limit,
        }

  return {
    schedulerId,
    jobName: input.name,
    jobData: input.data,
    repeatOptions,
    templateOptions: input.options,
  }
}

export function buildScheduledJobCreateInput(input: CreateScheduledJobInput): {
  schedulerId: string
  jobName: string
  jobData: unknown
  repeatOptions: Omit<RepeatOptions, 'key'>
  templateOptions?: ScheduledJobTemplateOptions
} {
  const { schedulerId, ...payload } = input
  return toScheduledJobMutationInput(schedulerId, payload)
}

export function buildScheduledJobUpdateInput(
  schedulerId: string,
  input: UpdateScheduledJobInput
): {
  schedulerId: string
  jobName: string
  jobData: unknown
  repeatOptions: Omit<RepeatOptions, 'key'>
  templateOptions?: ScheduledJobTemplateOptions
} {
  return toScheduledJobMutationInput(schedulerId, input)
}

export function mapScheduledJob(
  queueName: string,
  scheduler: JobSchedulerJson,
  stats?: { count: number; lastFailedAt?: number }
): ScheduledJobSummary {
  return {
    schedulerId: scheduler.key,
    pattern: scheduler.pattern ?? undefined,
    every:
      typeof scheduler.every === 'number'
        ? scheduler.every
        : scheduler.every
          ? Number(scheduler.every)
          : undefined,
    queueName,
    jobName: scheduler.name ?? '',
    nextRun: scheduler.next ? Number(scheduler.next) : undefined,
    enabled: true,
    data: scheduler.template?.data,
    templateOptions: scheduler.template?.opts as ScheduledJobTemplateOptions | undefined,
    timezone: scheduler.tz ?? undefined,
    startDate: scheduler.startDate ? Number(scheduler.startDate) : undefined,
    endDate: scheduler.endDate ? Number(scheduler.endDate) : undefined,
    limit: scheduler.limit ?? undefined,
    iterationCount: scheduler.iterationCount ?? undefined,
    recentFailedCount: stats?.count ?? 0,
    lastFailedAt: stats?.lastFailedAt,
  }
}

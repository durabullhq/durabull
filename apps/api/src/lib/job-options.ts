import type { JobsOptions } from 'bullmq'
import { z } from 'zod'

export const MAX_JOB_ATTEMPTS = 100
export const MAX_JOB_PRIORITY = 2_097_152
export const MAX_BACKOFF_DELAY_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_RETENTION_COUNT = 1_000_000
export const MAX_JOB_DELAY_MS = 365 * 24 * 60 * 60 * 1000

export const retentionSchema = z.union([
  z.boolean(),
  z.number().int().min(0).max(MAX_RETENTION_COUNT),
])

export const backoffSchema = z.object({
  type: z.enum(['fixed', 'exponential']),
  delay: z.number().int().min(0).max(MAX_BACKOFF_DELAY_MS),
})

export const jobTemplateOptionsSchema = z.object({
  attempts: z.number().int().min(1).max(MAX_JOB_ATTEMPTS).optional(),
  priority: z.number().int().min(0).max(MAX_JOB_PRIORITY).optional(),
  backoff: backoffSchema.optional(),
  removeOnComplete: retentionSchema.optional(),
  removeOnFail: retentionSchema.optional(),
})

export const jobOptionsSchema = jobTemplateOptionsSchema.extend({
  delay: z.number().int().min(0).max(MAX_JOB_DELAY_MS).optional(),
})

export const optionalJobTemplateOptionsSchema = jobTemplateOptionsSchema.optional()

export type JobTemplateOptionsInput = z.infer<typeof jobTemplateOptionsSchema>
export type JobOptionsInput = z.infer<typeof jobOptionsSchema>

export function buildQueueAddOptions(input: JobOptionsInput): JobsOptions {
  const options: JobsOptions = {}

  if (input.delay !== undefined && input.delay > 0) {
    options.delay = input.delay
  }

  if (input.priority !== undefined && input.priority > 0) {
    options.priority = input.priority
  }

  if (input.attempts !== undefined && input.attempts > 1) {
    options.attempts = input.attempts
  }

  if (input.backoff !== undefined) {
    options.backoff = input.backoff
  }

  if (input.removeOnComplete !== undefined) {
    options.removeOnComplete = input.removeOnComplete
  }

  if (input.removeOnFail !== undefined) {
    options.removeOnFail = input.removeOnFail
  }

  return options
}

export function buildTemplateOptions(
  input: JobTemplateOptionsInput | undefined
): JobTemplateOptionsInput | undefined {
  if (input === undefined) {
    return undefined
  }

  const options = buildQueueAddOptions(input)
  return Object.keys(options).length > 0 ? (options as JobTemplateOptionsInput) : undefined
}

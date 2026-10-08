export type BackoffMode = 'none' | 'fixed' | 'exponential'
export type RetentionMode = 'keep' | 'remove' | 'count'

export interface JobOptionsFormValue {
  delay: string
  attempts: string
  priority: string
  backoffMode: BackoffMode
  backoffDelay: string
  removeOnCompleteMode: RetentionMode
  removeOnCompleteCount: string
  removeOnFailMode: RetentionMode
  removeOnFailCount: string
}

export interface JobTemplateOptionsInput {
  attempts?: number
  priority?: number
  backoff?: { type: 'fixed' | 'exponential'; delay: number }
  removeOnComplete?: boolean | number
  removeOnFail?: boolean | number
}

export interface JobOptionsInput extends JobTemplateOptionsInput {
  delay?: number
}

export interface JobOptionsValidationErrors {
  delay?: string
  attempts?: string
  priority?: string
  backoff?: string
  removeOnComplete?: string
  removeOnFail?: string
}

export function createDefaultJobOptionsFormValue(): JobOptionsFormValue {
  return {
    delay: '0',
    attempts: '1',
    priority: '0',
    backoffMode: 'none',
    backoffDelay: '5000',
    removeOnCompleteMode: 'keep',
    removeOnCompleteCount: '100',
    removeOnFailMode: 'keep',
    removeOnFailCount: '100',
  }
}

export function parseOptionalWholeNumber(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  if (!/^\d+$/.test(normalized)) {
    return undefined
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

export function getRetentionMode(value: boolean | number | undefined): RetentionMode {
  if (value === true) {
    return 'remove'
  }

  if (typeof value === 'number') {
    return 'count'
  }

  return 'keep'
}

export function getRetentionCount(value: boolean | number | undefined): string {
  return typeof value === 'number' ? String(value) : '100'
}

function parseBackoff(backoff: unknown): Pick<JobOptionsFormValue, 'backoffMode' | 'backoffDelay'> {
  if (typeof backoff === 'number') {
    return {
      backoffMode: 'fixed',
      backoffDelay: String(backoff),
    }
  }

  if (
    backoff &&
    typeof backoff === 'object' &&
    'type' in backoff &&
    (backoff.type === 'fixed' || backoff.type === 'exponential') &&
    'delay' in backoff &&
    typeof backoff.delay === 'number'
  ) {
    return {
      backoffMode: backoff.type,
      backoffDelay: String(backoff.delay),
    }
  }

  return {
    backoffMode: 'none',
    backoffDelay: '5000',
  }
}

export function jobOptsToFormValue(
  opts: Record<string, unknown> | undefined,
  delay = 0
): JobOptionsFormValue {
  const defaults = createDefaultJobOptionsFormValue()
  if (!opts) {
    return {
      ...defaults,
      delay: String(delay),
    }
  }

  const backoff = parseBackoff(opts.backoff)

  return {
    delay: String(delay),
    attempts: opts.attempts ? String(opts.attempts) : defaults.attempts,
    priority: opts.priority ? String(opts.priority) : defaults.priority,
    backoffMode: backoff.backoffMode,
    backoffDelay: backoff.backoffDelay,
    removeOnCompleteMode: getRetentionMode(opts.removeOnComplete as boolean | number | undefined),
    removeOnCompleteCount: getRetentionCount(opts.removeOnComplete as boolean | number | undefined),
    removeOnFailMode: getRetentionMode(opts.removeOnFail as boolean | number | undefined),
    removeOnFailCount: getRetentionCount(opts.removeOnFail as boolean | number | undefined),
  }
}

export function templateOptionsToFormValue(
  templateOptions: JobTemplateOptionsInput | undefined
): Omit<JobOptionsFormValue, 'delay'> {
  const { delay: _delay, ...rest } = jobOptsToFormValue(
    templateOptions as Record<string, unknown> | undefined
  )
  return rest
}

export function validateJobOptionsFormValue(
  value: JobOptionsFormValue,
  options: { includeDelay?: boolean } = {}
): JobOptionsValidationErrors {
  const errors: JobOptionsValidationErrors = {}
  const includeDelay = options.includeDelay ?? false

  if (includeDelay) {
    const delayValue = parseOptionalWholeNumber(value.delay)
    if (delayValue === undefined) {
      errors.delay = 'Delay must be a whole number.'
    }
  }

  const attemptsValue = parseOptionalWholeNumber(value.attempts)
  if (attemptsValue === undefined || attemptsValue < 1) {
    errors.attempts = 'Attempts must be at least 1.'
  }

  const priorityValue = parseOptionalWholeNumber(value.priority)
  if (priorityValue === undefined) {
    errors.priority = 'Priority must be a whole number.'
  }

  const backoffDelayValue = parseOptionalWholeNumber(value.backoffDelay)
  if (value.backoffMode !== 'none' && (backoffDelayValue === undefined || backoffDelayValue < 1)) {
    errors.backoff = 'Backoff delay must be greater than 0.'
  }

  const removeOnCompleteCountValue = parseOptionalWholeNumber(value.removeOnCompleteCount)
  if (
    value.removeOnCompleteMode === 'count' &&
    (removeOnCompleteCountValue === undefined || removeOnCompleteCountValue < 1)
  ) {
    errors.removeOnComplete = 'Enter how many completed jobs to retain.'
  }

  const removeOnFailCountValue = parseOptionalWholeNumber(value.removeOnFailCount)
  if (
    value.removeOnFailMode === 'count' &&
    (removeOnFailCountValue === undefined || removeOnFailCountValue < 1)
  ) {
    errors.removeOnFail = 'Enter how many failed jobs to retain.'
  }

  return errors
}

export function hasJobOptionsValidationErrors(errors: JobOptionsValidationErrors): boolean {
  return Object.values(errors).some(Boolean)
}

export function formValueToTemplateOptions(
  value: Pick<JobOptionsFormValue, keyof Omit<JobOptionsFormValue, 'delay'>>
): JobTemplateOptionsInput | undefined {
  const attemptsValue = parseOptionalWholeNumber(value.attempts)
  const priorityValue = parseOptionalWholeNumber(value.priority)
  const backoffDelayValue = parseOptionalWholeNumber(value.backoffDelay)
  const removeOnCompleteCountValue = parseOptionalWholeNumber(value.removeOnCompleteCount)
  const removeOnFailCountValue = parseOptionalWholeNumber(value.removeOnFailCount)

  const options: JobTemplateOptionsInput = {}

  if ((attemptsValue ?? 1) > 1) {
    options.attempts = attemptsValue
  }

  if ((priorityValue ?? 0) > 0) {
    options.priority = priorityValue
  }

  if (value.backoffMode !== 'none' && backoffDelayValue) {
    options.backoff = {
      type: value.backoffMode,
      delay: backoffDelayValue,
    }
  }

  if (value.removeOnCompleteMode === 'remove') {
    options.removeOnComplete = true
  } else if (value.removeOnCompleteMode === 'count' && removeOnCompleteCountValue) {
    options.removeOnComplete = removeOnCompleteCountValue
  }

  if (value.removeOnFailMode === 'remove') {
    options.removeOnFail = true
  } else if (value.removeOnFailMode === 'count' && removeOnFailCountValue) {
    options.removeOnFail = removeOnFailCountValue
  }

  return Object.keys(options).length > 0 ? options : undefined
}

export function formValueToJobOptions(value: JobOptionsFormValue): JobOptionsInput | undefined {
  const templateOptions = formValueToTemplateOptions(value)
  const delayValue = parseOptionalWholeNumber(value.delay)
  const options: JobOptionsInput = { ...templateOptions }

  if (delayValue !== undefined && delayValue > 0) {
    options.delay = delayValue
  }

  return Object.keys(options).length > 0 ? options : undefined
}

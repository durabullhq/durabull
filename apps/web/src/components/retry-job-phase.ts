export const RetryJobPhase = {
  RETRYING: 'retrying',
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export type RetryJobPhase = (typeof RetryJobPhase)[keyof typeof RetryJobPhase]

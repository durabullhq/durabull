export type BoundedAsyncQueueProcessor<TInput, TResult = void> = (input: TInput) => Promise<TResult>

export interface BoundedAsyncQueueState {
  dropped: number
  inFlight: number
  queued: number
}

interface PendingQueueItem<TInput, TResult> {
  input: TInput
  process: BoundedAsyncQueueProcessor<TInput, TResult>
}

interface CreateBoundedAsyncQueueOptions<TInput, TResult> {
  maxInFlight: number
  maxQueueDepth: number
  onDrop?: (input: TInput, state: BoundedAsyncQueueState) => void
  onError?: (error: unknown, input: TInput) => void
  onResult?: (result: TResult, input: TInput) => void
}

export function createBoundedAsyncQueue<TInput, TResult = void>({
  maxInFlight,
  maxQueueDepth,
  onDrop,
  onError,
  onResult,
}: CreateBoundedAsyncQueueOptions<TInput, TResult>) {
  if (!Number.isInteger(maxInFlight) || maxInFlight < 1) {
    throw new RangeError('maxInFlight must be a positive integer')
  }

  if (!Number.isInteger(maxQueueDepth) || maxQueueDepth < 0) {
    throw new RangeError('maxQueueDepth must be a non-negative integer')
  }

  let inFlight = 0
  let dropped = 0
  let epoch = 0
  const pending: PendingQueueItem<TInput, TResult>[] = []

  function getState(): BoundedAsyncQueueState {
    return {
      dropped,
      inFlight,
      queued: pending.length,
    }
  }

  function notifyDrop(input: TInput): void {
    if (!onDrop) return

    try {
      onDrop(input, getState())
    } catch {
      // Queue accounting must not be disrupted by operational metric hooks.
    }
  }

  function notifyError(error: unknown, input: TInput): void {
    if (!onError) return

    try {
      onError(error, input)
    } catch {
      // Queue workers should keep draining even if an error hook fails.
    }
  }

  function notifyResult(result: TResult, input: TInput): void {
    if (!onResult) return

    try {
      onResult(result, input)
    } catch (error) {
      notifyError(error, input)
    }
  }

  function dispatch(item: PendingQueueItem<TInput, TResult>): void {
    inFlight += 1
    const dispatchEpoch = epoch
    void Promise.resolve()
      .then(() => item.process(item.input))
      .then((result) => {
        if (dispatchEpoch !== epoch) return
        notifyResult(result, item.input)
      })
      .catch((error) => {
        if (dispatchEpoch !== epoch) return
        notifyError(error, item.input)
      })
      .finally(() => {
        if (dispatchEpoch !== epoch) return
        inFlight -= 1
        flush()
      })
  }

  function flush(): void {
    while (inFlight < maxInFlight && pending.length > 0) {
      const next = pending.shift()
      if (!next) break
      dispatch(next)
    }
  }

  function enqueue(input: TInput, process: BoundedAsyncQueueProcessor<TInput, TResult>): boolean {
    if (inFlight < maxInFlight && pending.length === 0) {
      dispatch({ input, process })
      return true
    }

    if (pending.length >= maxQueueDepth) {
      dropped += 1
      notifyDrop(input)
      return false
    }

    pending.push({ input, process })
    flush()
    return true
  }

  function resetForTests(): void {
    epoch += 1
    inFlight = 0
    dropped = 0
    pending.length = 0
  }

  return {
    enqueue,
    getState,
    resetForTests,
  }
}

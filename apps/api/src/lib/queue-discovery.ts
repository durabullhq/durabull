import { randomUUID } from 'node:crypto'
import { type ConnectionMode, redisDiscoveredQueueRepository } from '@durabull/dal'
import { type RedisConnectionOptions, scanQueuesPage } from './redis'

const DEFAULT_DISCOVERY_SCAN_COUNT = 1000

interface QueueDiscoveryRuntime {
  runId: string
  connectionId: string
  running: boolean
  startedAt: number | null
  completedAt: number | null
  lastError: string | null
  scanCount: number
  scannedPages: number
  confirmedThisRun: number
  removedThisRun: number
}

interface QueueDiscoverySnapshot {
  total: number
  pending: number
  confirmed: number
  lastDiscoveredAt: number | null
}

export interface QueueDiscoveryStatus {
  runId: string | null
  running: boolean
  startedAt: number | null
  completedAt: number | null
  lastError: string | null
  scanCount: number
  scannedPages: number
  confirmedThisRun: number
  removedThisRun: number
  indexed: QueueDiscoverySnapshot
}

const activeDiscoveryRuns = new Map<string, Promise<void>>()
const discoveryStateByConnection = new Map<string, QueueDiscoveryRuntime>()

function toDiscoveryStatus(
  runtime: QueueDiscoveryRuntime | undefined,
  snapshot: QueueDiscoverySnapshot
): QueueDiscoveryStatus {
  return {
    runId: runtime?.runId ?? null,
    running: runtime?.running ?? false,
    startedAt: runtime?.startedAt ?? null,
    completedAt: runtime?.completedAt ?? null,
    lastError: runtime?.lastError ?? null,
    scanCount: runtime?.scanCount ?? DEFAULT_DISCOVERY_SCAN_COUNT,
    scannedPages: runtime?.scannedPages ?? 0,
    confirmedThisRun: runtime?.confirmedThisRun ?? 0,
    removedThisRun: runtime?.removedThisRun ?? 0,
    indexed: snapshot,
  }
}

async function getIndexedSnapshot(connectionId: string): Promise<QueueDiscoverySnapshot> {
  const summary = await redisDiscoveredQueueRepository.getSummary(connectionId)
  return {
    total: summary.total,
    pending: summary.pending,
    confirmed: summary.confirmed,
    lastDiscoveredAt: summary.lastDiscoveredAt ? summary.lastDiscoveredAt.getTime() : null,
  }
}

async function runQueueDiscovery(
  connectionId: string,
  connectionUrl: string,
  scanCount: number,
  prefix = 'bull',
  redisOptions?: RedisConnectionOptions,
  mode: ConnectionMode = 'standalone'
): Promise<void> {
  const runtime = discoveryStateByConnection.get(connectionId)
  if (!runtime) return

  let cursor = '0'
  const discoveredQueueNames = new Set<string>()

  do {
    if (discoveryStateByConnection.get(connectionId) !== runtime) return

    const page = await scanQueuesPage(
      connectionId,
      connectionUrl,
      cursor,
      scanCount,
      prefix,
      redisOptions,
      mode
    )
    cursor = page.cursor
    runtime.scannedPages += 1

    for (const queueName of page.queueNames) {
      discoveredQueueNames.add(queueName)
    }

    runtime.confirmedThisRun = discoveredQueueNames.size
  } while (cursor !== '0')

  if (discoveryStateByConnection.get(connectionId) !== runtime) return

  const syncResult = await redisDiscoveredQueueRepository.syncConnectionSnapshot(
    connectionId,
    Array.from(discoveredQueueNames),
    new Date()
  )
  runtime.confirmedThisRun = syncResult.confirmed
  runtime.removedThisRun = syncResult.removed
}

export async function getQueueDiscoveryStatus(connectionId: string): Promise<QueueDiscoveryStatus> {
  const runtime = discoveryStateByConnection.get(connectionId)
  const snapshot = await getIndexedSnapshot(connectionId)
  return toDiscoveryStatus(runtime, snapshot)
}

export function resetQueueDiscoveryState(connectionId: string): void {
  discoveryStateByConnection.delete(connectionId)
  activeDiscoveryRuns.delete(connectionId)
}

export async function startQueueDiscovery(
  connectionId: string,
  connectionUrl: string,
  options?: {
    scanCount?: number
    prefix?: string
    allowSelfSignedCerts?: boolean
    mode?: ConnectionMode
  }
): Promise<QueueDiscoveryStatus> {
  const existingRun = activeDiscoveryRuns.get(connectionId)
  if (existingRun) {
    return getQueueDiscoveryStatus(connectionId)
  }

  const scanCount = Math.max(100, options?.scanCount ?? DEFAULT_DISCOVERY_SCAN_COUNT)
  const prefix = options?.prefix ?? 'bull'
  const redisOptions: RedisConnectionOptions = {
    allowSelfSignedCerts: options?.allowSelfSignedCerts ?? false,
  }
  const runtime: QueueDiscoveryRuntime = {
    runId: randomUUID(),
    connectionId,
    running: true,
    startedAt: Date.now(),
    completedAt: null,
    lastError: null,
    scanCount,
    scannedPages: 0,
    confirmedThisRun: 0,
    removedThisRun: 0,
  }

  discoveryStateByConnection.set(connectionId, runtime)

  const mode = options?.mode ?? 'standalone'
  const runPromise = runQueueDiscovery(
    connectionId,
    connectionUrl,
    scanCount,
    prefix,
    redisOptions,
    mode
  )
    .catch((error) => {
      if (discoveryStateByConnection.get(connectionId) === runtime) {
        runtime.lastError = error instanceof Error ? error.message : String(error)
      }
      throw error
    })
    .finally(() => {
      if (discoveryStateByConnection.get(connectionId) === runtime) {
        runtime.running = false
        runtime.completedAt = Date.now()
      }
      if (activeDiscoveryRuns.get(connectionId) === runPromise) {
        activeDiscoveryRuns.delete(connectionId)
      }
    })

  activeDiscoveryRuns.set(connectionId, runPromise)

  return getQueueDiscoveryStatus(connectionId)
}

export async function waitForQueueDiscovery(connectionId: string): Promise<void> {
  const activeRun = activeDiscoveryRuns.get(connectionId)
  if (!activeRun) return
  await activeRun
}

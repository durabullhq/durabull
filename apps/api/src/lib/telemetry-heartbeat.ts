import { AnalyticsEvents } from '@durabull/analytics/events'
import {
  captureAnonymousServerEvent,
  tryGetServerAnalyticsOptions,
} from '@durabull/analytics/server'

/**
 * Fixed session id for the heartbeat, so its anonymous distinct_id is stable per install.
 * Counting unique people on `instance_active` therefore counts installs, not browser sessions.
 */
export const INSTANCE_HEARTBEAT_SESSION_ID = 'instance-heartbeat'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const STARTUP_DELAY_MS = 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let lastSentUtcDay: string | null = null
let inFlight: Promise<void> | null = null

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/**
 * Send `instance_active` once per UTC day while the process runs. Restarts may send it again
 * the same day, which is harmless because installs are counted as unique ids per day.
 */
export async function sendInstanceHeartbeatIfDue(nowMs: number = Date.now()): Promise<void> {
  const options = tryGetServerAnalyticsOptions()
  if (!options?.enabled) return

  const day = utcDay(nowMs)
  if (lastSentUtcDay === day) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const anonymousInstanceId = await options.resolveAnonymousInstanceId()
      await captureAnonymousServerEvent({
        anonymousInstanceId,
        event: AnalyticsEvents.INSTANCE_ACTIVE,
        properties: {},
        sessionId: INSTANCE_HEARTBEAT_SESSION_ID,
        timestamp: new Date(nowMs).toISOString(),
      })
      lastSentUtcDay = day
    } catch {
      // Telemetry must never affect product runtime; retry on the next hourly check.
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export function startTelemetryHeartbeat(): void {
  if (timer || startupTimer) return
  if (!tryGetServerAnalyticsOptions()?.enabled) return

  // Delay the first beat so startup work and the installation id lookup settle first.
  startupTimer = setTimeout(() => {
    startupTimer = null
    void sendInstanceHeartbeatIfDue()
  }, STARTUP_DELAY_MS)
  startupTimer.unref?.()

  timer = setInterval(() => {
    void sendInstanceHeartbeatIfDue()
  }, CHECK_INTERVAL_MS)
  timer.unref?.()
}

export function stopTelemetryHeartbeat(): void {
  if (startupTimer) clearTimeout(startupTimer)
  if (timer) clearInterval(timer)
  startupTimer = null
  timer = null
}

/** Test-only: forget the last sent day between cases. */
export function resetTelemetryHeartbeatForTests(): void {
  if (process.env.NODE_ENV !== 'test') return
  stopTelemetryHeartbeat()
  lastSentUtcDay = null
  inFlight = null
}

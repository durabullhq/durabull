# Alerting System — Complete Implementation Plan

> Historical design plan. Background monitoring and alert integrations are now implemented.
> For current behavior, see [Redis Health and Alerts](apps/docs/content/documentation/workflows/redis-health-alerts.mdx),
> [Webhooks](apps/docs/content/documentation/integrations/webhooks.mdx), and
> [Linear](apps/docs/content/documentation/integrations/linear.mdx).

## Problem Statement

Durabull currently only connects to customer Redis instances on-demand — when a user is actively browsing the dashboard. There is no background process monitoring queues for failures. To offer alerting (e.g. "your `email-send` queue has 50 failed jobs in the last 5 minutes"), we need a persistent connection layer that runs independently of user sessions.

---

## Key Design Decisions

### Per-queue polling (not per-job, not real-time)

- **Per-queue is the right granularity.** Per-job alerting would require `QueueEvents` listeners (one persistent Redis connection per queue), which doesn't scale.
- **Polling over `QueueEvents`.** BullMQ stores failed counts in Redis sorted sets. We poll `queue.getJobCounts()` and `queue.getMetrics()` on an interval. If the server restarts, it picks up on the next tick.
- **Postgres is the deduplication layer.** We track polling state in Postgres to compute deltas and suppress duplicate alerts.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Durabull API (Hono/Bun)               │
│                                                         │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │  Existing API    │    │  Alert Monitor (Background) │  │
│  │  Routes          │    │                            │  │
│  │  (on-demand)     │    │  1. Poll loop (interval)   │  │
│  │                  │    │  2. For each connection:    │  │
│  │                  │    │     - Get discovered queues │  │
│  │                  │    │     - Poll failed counts    │  │
│  │                  │    │  3. Evaluate alert rules    │  │
│  │                  │    │  4. Dedupe via Postgres     │  │
│  │                  │    │  5. Dispatch notifications  │  │
│  └─────────────────┘    └────────────────────────────┘  │
│           │                         │                    │
│           ▼                         ▼                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Shared Redis Connection Cache           │    │
│  │          (existing: apps/api/src/lib/redis.ts)   │    │
│  └─────────────────────────────────────────────────┘    │
│           │                         │                    │
└───────────┼─────────────────────────┼────────────────────┘
            ▼                         ▼
    ┌──────────────┐          ┌──────────────┐
    │   Postgres   │          │  Customer    │
    │   (alerts,   │          │  Redis       │
    │    rules,    │          │  Instances   │
    │    history)  │          │              │
    └──────────────┘          └──────────────┘
```

---

## Build Order (for AI agents)

Each phase is independently shippable. Later phases depend on earlier ones.

```
Phase 1: Database schemas + repositories  (DAL package only, no API changes)
Phase 2: Alert evaluator                  (pure functions, no dependencies beyond types)
Phase 3: Alert monitor background loop    (depends on Phase 1 + 2)
Phase 4: Alert notifier + email template  (depends on Phase 1, uses @durabull/email)
Phase 5: API routes                       (depends on Phase 1, wires up Phase 3 + 4)
Phase 6: Integration — mount routes, start monitor on boot
Phase 7: Frontend                         (out of scope for now)
```

---

## Phase 1: Database Schemas + Repositories

### 1A. Schema: `alert_rule`

**File:** `packages/dal/src/db/schemas/alert-rule/schema.ts`

```typescript
import { boolean, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { organization } from '../organization/schema'
import { redisConnection } from '../redis-connection/schema'

export const alertRuleTypes = ['failure_threshold', 'failure_rate', 'queue_stalled'] as const
export type AlertRuleType = (typeof alertRuleTypes)[number]

export const alertRule = pgTable('alert_rule', {
  ...baseColumns,
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => redisConnection.id, { onDelete: 'cascade' }),
  queueName: text('queue_name'),                         // NULL = all queues on connection
  name: text('name').notNull(),
  type: text('type').$type<AlertRuleType>().notNull(),
  config: jsonb('config').notNull(),                     // Type-specific, see below
  enabled: boolean('enabled').notNull().default(true),
  notificationChannels: jsonb('notification_channels').notNull().default([]),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(30),
})
```

**Config shapes by type:**

```typescript
// failure_threshold — "≥ N failures in M minutes"
interface FailureThresholdConfig {
  count: number        // e.g. 10
  windowMinutes: number // e.g. 5
}

// failure_rate — "failure rate > X% over M minutes"
interface FailureRateConfig {
  rate: number          // 0.0–1.0, e.g. 0.5 = 50%
  windowMinutes: number
  minSample: number     // Minimum total jobs before rate is meaningful
}

// queue_stalled — "waiting jobs but no completions for M minutes"
interface QueueStalledConfig {
  stalledMinutes: number
}
```

**Notification channel shape:**

```typescript
interface NotificationChannel {
  type: 'email'          // Future: 'webhook' | 'slack' | 'pagerduty'
  target: string         // Email address (or webhook URL, etc.)
}
```

**File:** `packages/dal/src/db/schemas/alert-rule/types.ts`

```typescript
import type { alertRule } from './schema'

export type AlertRule = typeof alertRule.$inferSelect
export type NewAlertRule = typeof alertRule.$inferInsert
export type { AlertRuleType } from './schema'
```

### 1B. Schema: `alert_event`

**File:** `packages/dal/src/db/schemas/alert-event/schema.ts`

```typescript
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { alertRule } from '../alert-rule/schema'
import { organization } from '../organization/schema'
import { redisConnection } from '../redis-connection/schema'

export const alertEventStatuses = ['firing', 'resolved', 'suppressed'] as const
export type AlertEventStatus = (typeof alertEventStatuses)[number]

export const alertEvent = pgTable(
  'alert_event',
  {
    ...baseColumns,
    alertRuleId: uuid('alert_rule_id')
      .notNull()
      .references(() => alertRule.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => redisConnection.id, { onDelete: 'cascade' }),
    queueName: text('queue_name').notNull(),
    type: text('type').notNull(),
    status: text('status').$type<AlertEventStatus>().notNull().default('firing'),
    summary: text('summary').notNull(),
    context: jsonb('context'),
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notificationSentAt: timestamp('notification_sent_at', { withTimezone: true }),
  },
  (table) => ({
    ruleStatusIdx: index('alert_event_rule_id_status_idx').on(table.alertRuleId, table.status),
    orgFiredAtIdx: index('alert_event_org_id_fired_at_idx').on(table.organizationId, table.firedAt),
    connQueueStatusIdx: index('alert_event_conn_queue_status_idx').on(
      table.connectionId,
      table.queueName,
      table.status
    ),
  })
)
```

**File:** `packages/dal/src/db/schemas/alert-event/types.ts`

```typescript
import type { alertEvent } from './schema'

export type AlertEvent = typeof alertEvent.$inferSelect
export type NewAlertEvent = typeof alertEvent.$inferInsert
export type { AlertEventStatus } from './schema'
```

### 1C. Schema: `alert_check_cursor`

**File:** `packages/dal/src/db/schemas/alert-check-cursor/schema.ts`

```typescript
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { baseColumns } from '../common'
import { redisConnection } from '../redis-connection/schema'

export const alertCheckCursor = pgTable(
  'alert_check_cursor',
  {
    ...baseColumns,
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => redisConnection.id, { onDelete: 'cascade' }),
    queueName: text('queue_name').notNull(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull(),
    lastFailedCount: integer('last_failed_count').notNull().default(0),
    lastCompletedCount: integer('last_completed_count').notNull().default(0),
    lastMetricsSnapshot: jsonb('last_metrics_snapshot'),
  },
  (table) => ({
    uniqueConnectionQueue: uniqueIndex('alert_check_cursor_connection_queue_idx').on(
      table.connectionId,
      table.queueName
    ),
  })
)
```

**File:** `packages/dal/src/db/schemas/alert-check-cursor/types.ts`

```typescript
import type { alertCheckCursor } from './schema'

export type AlertCheckCursor = typeof alertCheckCursor.$inferSelect
export type NewAlertCheckCursor = typeof alertCheckCursor.$inferInsert
```

### 1D. Barrel Export Additions

These files must be updated to register the new schemas. Follow the exact patterns used by existing schemas.

**File:** `packages/dal/src/db/schemas/tables.ts` — Add these lines:

```typescript
// Alert schema tables
export { alertRule } from './alert-rule/schema'
export { alertEvent } from './alert-event/schema'
export { alertCheckCursor } from './alert-check-cursor/schema'
```

**File:** `packages/dal/src/db/schemas/index.ts` — Add these lines:

```typescript
// Alert Rule schema exports
export { alertRule, type AlertRuleType, alertRuleTypes } from './alert-rule/schema'
export type { AlertRule, NewAlertRule } from './alert-rule/types'

// Alert Event schema exports
export { alertEvent, type AlertEventStatus, alertEventStatuses } from './alert-event/schema'
export type { AlertEvent, NewAlertEvent } from './alert-event/types'

// Alert Check Cursor schema exports
export { alertCheckCursor } from './alert-check-cursor/schema'
export type { AlertCheckCursor, NewAlertCheckCursor } from './alert-check-cursor/types'
```

**File:** `packages/dal/src/db/schemas/relations.ts` — Add inside `defineRelations()`:

```typescript
alertRule: {
  organization: r.one.organization({
    from: r.alertRule.organizationId,
    to: r.organization.id,
  }),
  connection: r.one.redisConnection({
    from: r.alertRule.connectionId,
    to: r.redisConnection.id,
  }),
  events: r.many.alertEvent(),
},
alertEvent: {
  rule: r.one.alertRule({
    from: r.alertEvent.alertRuleId,
    to: r.alertRule.id,
  }),
  organization: r.one.organization({
    from: r.alertEvent.organizationId,
    to: r.organization.id,
  }),
  connection: r.one.redisConnection({
    from: r.alertEvent.connectionId,
    to: r.redisConnection.id,
  }),
},
alertCheckCursor: {
  connection: r.one.redisConnection({
    from: r.alertCheckCursor.connectionId,
    to: r.redisConnection.id,
  }),
},
```

Also add to the `organization` block:

```typescript
alertRules: r.many.alertRule(),
alertEvents: r.many.alertEvent(),
```

And to the `redisConnection` block (add this block if it doesn't exist — currently there's no `redisConnection` relations block):

```typescript
redisConnection: {
  organization: r.one.organization({
    from: r.redisConnection.organizationId,
    to: r.organization.id,
  }),
  discoveredQueues: r.many.redisDiscoveredQueue(),
  alertRules: r.many.alertRule(),
  alertEvents: r.many.alertEvent(),
  alertCheckCursors: r.many.alertCheckCursor(),
},
```

**File:** `packages/dal/src/index.ts` — Add these exports:

```typescript
// Alert exports
export { alertRule, type AlertRuleType, alertRuleTypes } from './db/schemas/alert-rule/schema'
export type { AlertRule, NewAlertRule } from './db/schemas/alert-rule/types'
export {
  alertEvent,
  type AlertEventStatus,
  alertEventStatuses,
} from './db/schemas/alert-event/schema'
export type { AlertEvent, NewAlertEvent } from './db/schemas/alert-event/types'
export { alertCheckCursor } from './db/schemas/alert-check-cursor/schema'
export type { AlertCheckCursor, NewAlertCheckCursor } from './db/schemas/alert-check-cursor/types'

// Alert repositories
export { alertRuleRepository } from './repositories/alert-rule'
export { alertEventRepository } from './repositories/alert-event'
export { alertCheckCursorRepository } from './repositories/alert-check-cursor'
```

### 1E. Migration

After creating the schema files, generate the migration:

```bash
cd packages/dal
bunx drizzle-kit generate
```

This will create a new migration SQL file in `packages/dal/src/db/migrations/`. The migration will be applied automatically on next API boot via the `getDb()` initialization in `client.ts`.

**Important:** Do NOT write the migration SQL by hand. Drizzle Kit generates it from the schema diff. Just create the schema `.ts` files correctly and run the generate command.

### 1F. Repositories

#### `packages/dal/src/repositories/alert-rule.ts`

Follow the `redisConnectionRepository` pattern. Key methods:

```typescript
export const alertRuleRepository = {
  // Create a new alert rule
  async create(data: Omit<NewAlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertRule>

  // Find by ID, scoped to organization
  async findById(id: string, organizationId: string): Promise<AlertRule | null>

  // List all rules for a connection
  async findByConnection(connectionId: string, organizationId: string): Promise<AlertRule[]>

  // List all enabled rules across all connections (used by alert monitor)
  // Groups results by connectionId for efficient processing
  async findAllEnabled(): Promise<AlertRule[]>

  // Update a rule
  async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<AlertRule, 'name' | 'type' | 'config' | 'enabled' | 'notificationChannels' | 'cooldownMinutes' | 'queueName'>>
  ): Promise<AlertRule | null>

  // Delete a rule (cascades to alert_event via FK)
  async delete(id: string, organizationId: string): Promise<boolean>

  // Count rules for a connection (for plan limits)
  async countByConnection(connectionId: string, organizationId: string): Promise<number>
}
```

**Critical:** `findAllEnabled()` is the only method NOT scoped to organization. It's used by the background monitor to load all rules across all orgs in a single query. All other methods must enforce `organizationId` in the WHERE clause.

#### `packages/dal/src/repositories/alert-event.ts`

```typescript
export const alertEventRepository = {
  // Create a new event
  async create(data: Omit<NewAlertEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertEvent>

  // Find active (firing) event for a rule + queue combo (for dedup/cooldown)
  async findActiveFiring(alertRuleId: string, queueName: string): Promise<AlertEvent | null>

  // Find most recent event for a rule (for cooldown check)
  async findMostRecentForRule(alertRuleId: string, queueName: string): Promise<AlertEvent | null>

  // List events for a connection (paginated)
  async findByConnection(
    connectionId: string,
    organizationId: string,
    options: { offset: number; limit: number; status?: AlertEventStatus }
  ): Promise<AlertEvent[]>

  // List events for an organization (paginated, across all connections)
  async findByOrganization(
    organizationId: string,
    options: { offset: number; limit: number; status?: AlertEventStatus }
  ): Promise<AlertEvent[]>

  // List events for a specific rule
  async findByRule(
    alertRuleId: string,
    options: { offset: number; limit: number }
  ): Promise<AlertEvent[]>

  // Count active (firing) events per connection (for nav badge)
  async countFiringByOrganization(
    organizationId: string
  ): Promise<{ connectionId: string; count: number }[]>

  // Resolve an event
  async resolve(id: string, organizationId: string): Promise<AlertEvent | null>

  // Mark notification as sent
  async markNotificationSent(id: string): Promise<void>

  // Bulk update: resolve all firing events for a rule (when rule is disabled/deleted)
  async resolveAllForRule(alertRuleId: string): Promise<number>

  // Cleanup: delete events older than N days
  async deleteOlderThan(days: number): Promise<number>
}
```

#### `packages/dal/src/repositories/alert-check-cursor.ts`

```typescript
export const alertCheckCursorRepository = {
  // Upsert cursor after each poll (uses ON CONFLICT on unique index)
  async upsert(data: {
    connectionId: string
    queueName: string
    lastCheckedAt: Date
    lastFailedCount: number
    lastCompletedCount: number
    lastMetricsSnapshot?: unknown
  }): Promise<AlertCheckCursor>

  // Get cursor for a specific queue
  async findByConnectionQueue(
    connectionId: string,
    queueName: string
  ): Promise<AlertCheckCursor | null>

  // Get all cursors for a connection (batch load for monitor)
  async findByConnection(connectionId: string): Promise<AlertCheckCursor[]>

  // Delete cursors for a connection (when connection is deleted — also handled by CASCADE)
  async deleteByConnection(connectionId: string): Promise<number>
}
```

---

## Phase 2: Alert Evaluator (Pure Functions)

**File:** `apps/api/src/lib/alert-evaluator.ts`

This module contains only pure functions with no side effects — easy to unit test.

### Core Interface

```typescript
export interface AlertEvaluation {
  triggered: boolean
  summary: string
  context: Record<string, unknown>
}

export interface QueueSnapshot {
  queueName: string
  connectionName: string
  jobCounts: { failed: number; waiting: number; active: number; completed: number }
  failedMetrics: { count: number; dataPoints: number[] }   // from queue.getMetrics('failed')
  completedMetrics: { count: number; dataPoints: number[] } // from queue.getMetrics('completed')
}

export interface CursorState {
  lastFailedCount: number
  lastCompletedCount: number
  lastCheckedAt: Date
}
```

### Evaluator Functions

```typescript
/**
 * failure_threshold: "≥ N NEW failures in M minutes"
 * Uses delta from cursor to avoid re-alerting on old failures.
 */
export function evaluateFailureThreshold(
  config: { count: number; windowMinutes: number },
  snapshot: QueueSnapshot,
  cursor: CursorState | null
): AlertEvaluation {
  const currentFailed = snapshot.jobCounts.failed
  const previousFailed = cursor?.lastFailedCount ?? 0
  const delta = Math.max(0, currentFailed - previousFailed)

  return {
    triggered: delta >= config.count,
    summary: delta >= config.count
      ? `${delta} jobs failed in ${snapshot.queueName} (last ${config.windowMinutes} min, threshold: ${config.count})`
      : '',
    context: { delta, currentFailed, previousFailed, threshold: config.count, windowMinutes: config.windowMinutes },
  }
}

/**
 * failure_rate: "failure rate > X% over M minutes"
 * Uses BullMQ metrics (time-windowed data points).
 */
export function evaluateFailureRate(
  config: { rate: number; windowMinutes: number; minSample: number },
  snapshot: QueueSnapshot,
  _cursor: CursorState | null
): AlertEvaluation {
  const totalFailed = snapshot.failedMetrics.count
  const totalCompleted = snapshot.completedMetrics.count
  const totalProcessed = totalFailed + totalCompleted

  if (totalProcessed < config.minSample) {
    return { triggered: false, summary: '', context: { totalProcessed, minSample: config.minSample, skipped: true } }
  }

  const rate = totalFailed / totalProcessed

  return {
    triggered: rate > config.rate,
    summary: rate > config.rate
      ? `${(rate * 100).toFixed(1)}% failure rate in ${snapshot.queueName} (${totalFailed}/${totalProcessed} jobs, threshold: ${(config.rate * 100).toFixed(0)}%)`
      : '',
    context: { rate, totalFailed, totalCompleted, totalProcessed, threshold: config.rate },
  }
}

/**
 * queue_stalled: "waiting jobs but no completions for M minutes"
 * Detects when workers have died.
 */
export function evaluateQueueStalled(
  config: { stalledMinutes: number },
  snapshot: QueueSnapshot,
  cursor: CursorState | null
): AlertEvaluation {
  const hasWaiting = snapshot.jobCounts.waiting > 0 || snapshot.jobCounts.active > 0
  const recentCompletions = snapshot.completedMetrics.count
  const minutesSinceLastCheck = cursor
    ? (Date.now() - cursor.lastCheckedAt.getTime()) / 60_000
    : 0

  // Only trigger if: has waiting/active jobs AND no completions in the metrics window
  const triggered = hasWaiting && recentCompletions === 0 && minutesSinceLastCheck >= config.stalledMinutes

  return {
    triggered,
    summary: triggered
      ? `${snapshot.queueName} appears stalled: ${snapshot.jobCounts.waiting} waiting, ${snapshot.jobCounts.active} active, 0 completions in last ${config.stalledMinutes} min`
      : '',
    context: {
      waiting: snapshot.jobCounts.waiting,
      active: snapshot.jobCounts.active,
      recentCompletions,
      stalledMinutes: config.stalledMinutes,
    },
  }
}
```

### Dispatch Function

```typescript
import type { AlertRule } from '@durabull/dal'

/**
 * Route evaluation to the correct function based on rule type.
 */
export function evaluateRule(
  rule: AlertRule,
  snapshot: QueueSnapshot,
  cursor: CursorState | null
): AlertEvaluation {
  const config = rule.config as Record<string, unknown>

  switch (rule.type) {
    case 'failure_threshold':
      return evaluateFailureThreshold(config as any, snapshot, cursor)
    case 'failure_rate':
      return evaluateFailureRate(config as any, snapshot, cursor)
    case 'queue_stalled':
      return evaluateQueueStalled(config as any, snapshot, cursor)
    default:
      return { triggered: false, summary: `Unknown rule type: ${rule.type}`, context: {} }
  }
}
```

---

## Phase 3: Alert Monitor (Background Loop)

**File:** `apps/api/src/lib/alert-monitor.ts`

### Constants

```typescript
const POLL_INTERVAL_MS = 60_000           // 1 minute
const MAX_STARTUP_JITTER_MS = 30_000      // Random delay on first poll
const CONNECTION_TIMEOUT_MS = 30_000       // Timeout per connection check
const MAX_CONCURRENT_CONNECTIONS = 3       // Parallel connection checks
const METRICS_WINDOW_MINUTES = 60          // Default window for BullMQ metrics
```

### Exported API

```typescript
let pollTimer: ReturnType<typeof setInterval> | null = null
let isRunning = false

/**
 * Start the alert monitor. Called once on API boot.
 * Adds random jitter to first poll to avoid thundering herd.
 */
export function startAlertMonitor(): void {
  if (isRunning) return
  isRunning = true

  const jitter = Math.floor(Math.random() * MAX_STARTUP_JITTER_MS)
  console.log(`[alert-monitor] Starting in ${(jitter / 1000).toFixed(0)}s...`)

  setTimeout(() => {
    void runPollCycle()
    pollTimer = setInterval(() => void runPollCycle(), POLL_INTERVAL_MS)
  }, jitter)
}

/**
 * Stop the alert monitor. Called on graceful shutdown.
 */
export function stopAlertMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  isRunning = false
  console.log('[alert-monitor] Stopped.')
}
```

### Poll Cycle Pseudocode

```typescript
async function runPollCycle(): Promise<void> {
  try {
    // 1. Load all enabled rules from Postgres
    const rules = await alertRuleRepository.findAllEnabled()
    if (rules.length === 0) return

    // 2. Group rules by connectionId
    const rulesByConnection = groupBy(rules, (r) => r.connectionId)

    // 3. Process connections with bounded concurrency
    const connectionIds = Object.keys(rulesByConnection)
    await processWithConcurrency(connectionIds, MAX_CONCURRENT_CONNECTIONS, async (connectionId) => {
      await processConnection(connectionId, rulesByConnection[connectionId])
    })
  } catch (error) {
    console.error('[alert-monitor] Poll cycle failed:', error)
  }
}
```

### Per-Connection Processing

```typescript
async function processConnection(connectionId: string, rules: AlertRule[]): Promise<void> {
  // Wrap in timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)

  try {
    // 1. Look up connection from DAL (need URL and name)
    const connection = await redisConnectionRepository.findByIdUnsafe(connectionId)
    if (!connection) return

    // 2. Get Redis connection (reuses existing cache from redis.ts)
    //    Use getRedis(connectionId, connection.url, connection.name)
    //    If Redis is unreachable, this throws and we skip this connection.

    // 3. Determine which queues to check:
    //    - For rules with queueName set: check that specific queue
    //    - For rules with queueName = NULL: get all discovered queues from DB
    //      via redisDiscoveredQueueRepository.listByConnection()

    // 4. Load existing cursors for this connection
    const cursors = await alertCheckCursorRepository.findByConnection(connectionId)
    const cursorMap = new Map(cursors.map((c) => [c.queueName, c]))

    // 5. For each queue, collect snapshot and evaluate
    for (const queueName of queuesToCheck) {
      const queue = getQueue(connectionId, connection.url, queueName)

      // Collect data from BullMQ (same APIs used by bullmq-metrics.ts)
      const [jobCounts, failedMetrics, completedMetrics] = await Promise.all([
        queue.getJobCounts('failed', 'waiting', 'active', 'completed'),
        queue.getMetrics('failed', 0, METRICS_WINDOW_MINUTES),
        queue.getMetrics('completed', 0, METRICS_WINDOW_MINUTES),
      ])

      const snapshot: QueueSnapshot = {
        queueName,
        connectionName: connection.name,
        jobCounts,
        failedMetrics,
        completedMetrics,
      }

      const cursor = cursorMap.get(queueName) ?? null

      // Evaluate applicable rules
      const applicableRules = rules.filter(
        (r) => r.queueName === null || r.queueName === queueName
      )

      for (const rule of applicableRules) {
        await evaluateAndMaybeAlert(rule, snapshot, cursor, connection)
      }

      // Update cursor
      await alertCheckCursorRepository.upsert({
        connectionId,
        queueName,
        lastCheckedAt: new Date(),
        lastFailedCount: jobCounts.failed,
        lastCompletedCount: jobCounts.completed,
        lastMetricsSnapshot: { jobCounts, failedMetrics, completedMetrics },
      })
    }
  } catch (error) {
    // Log and continue — don't let one connection block others
    console.error(`[alert-monitor] Connection ${connectionId} failed:`, error)
  } finally {
    clearTimeout(timeout)
  }
}
```

### Alert Firing Logic

```typescript
async function evaluateAndMaybeAlert(
  rule: AlertRule,
  snapshot: QueueSnapshot,
  cursor: CursorState | null,
  connection: RedisConnection
): Promise<void> {
  const evaluation = evaluateRule(rule, snapshot, cursor)
  if (!evaluation.triggered) return

  // Check cooldown: find most recent event for this rule + queue
  const recentEvent = await alertEventRepository.findMostRecentForRule(rule.id, snapshot.queueName)

  if (recentEvent) {
    const cooldownMs = rule.cooldownMinutes * 60_000
    const timeSinceLast = Date.now() - recentEvent.firedAt.getTime()

    if (timeSinceLast < cooldownMs) {
      // Within cooldown — suppress
      console.log(`[alert-monitor] Suppressed alert for rule ${rule.name} (cooldown)`)
      return
    }
  }

  // Fire alert
  const event = await alertEventRepository.create({
    alertRuleId: rule.id,
    organizationId: rule.organizationId,
    connectionId: rule.connectionId,
    queueName: snapshot.queueName,
    type: rule.type,
    status: 'firing',
    summary: evaluation.summary,
    context: evaluation.context,
    firedAt: new Date(),
  })

  console.log(`[alert-monitor] 🚨 Alert fired: ${evaluation.summary}`)

  // Dispatch notification (Phase 4)
  const channels = rule.notificationChannels as NotificationChannel[]
  if (channels.length > 0) {
    try {
      await dispatchAlertNotification(event, channels, connection)
      await alertEventRepository.markNotificationSent(event.id)
    } catch (error) {
      console.error(`[alert-monitor] Notification dispatch failed:`, error)
    }
  }
}
```

### Utility: Bounded Concurrency

```typescript
async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!
      await fn(item)
    }
  })
  await Promise.all(workers)
}
```

---

## Phase 4: Notification Dispatch + Email Template

### 4A. Notifier

**File:** `apps/api/src/lib/alert-notifier.ts`

```typescript
import type { AlertEvent, RedisConnection } from '@durabull/dal'
import { isEmailConfigured } from '@durabull/email'
import { env } from '@durabull/env'

export interface NotificationChannel {
  type: 'email'
  target: string
}

export async function dispatchAlertNotification(
  event: AlertEvent,
  channels: NotificationChannel[],
  connection: RedisConnection
): Promise<void> {
  for (const channel of channels) {
    switch (channel.type) {
      case 'email':
        await sendAlertEmail(channel.target, event, connection)
        break
      // Future: 'webhook', 'slack', 'pagerduty'
      default:
        console.warn(`[alert-notifier] Unknown channel type: ${channel.type}`)
    }
  }
}

async function sendAlertEmail(
  to: string,
  event: AlertEvent,
  connection: RedisConnection
): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('[alert-notifier] RESEND_API_KEY not configured, skipping email')
    return
  }

  // Import dynamically to avoid loading email deps when not needed
  const { sendAlertNotificationEmail } = await import('@durabull/email')

  await sendAlertNotificationEmail({
    to,
    alertRuleName: event.type,
    queueName: event.queueName,
    connectionName: connection.name,
    summary: event.summary,
    firedAt: event.firedAt,
    context: event.context as Record<string, unknown>,
    dashboardUrl: `${env.APP_BASE_URL}/connections/${connection.id}/queues/${encodeURIComponent(event.queueName)}`,
    muteUrl: `${env.APP_BASE_URL}/connections/${connection.id}/alerts/rules/${event.alertRuleId}`,
  })
}
```

### 4B. Email Template

**File:** `packages/email/src/templates/alert.tsx`

Follow the exact pattern of `invite.tsx`: React Email component with Durabull branding.

```typescript
export interface AlertEmailProps {
  alertRuleName: string
  queueName: string
  connectionName: string
  summary: string
  firedAt: Date
  context: Record<string, unknown>
  dashboardUrl: string
  muteUrl: string
}
```

**Template content should include:**
- Durabull logo (same SVG as invite template)
- Alert severity indicator (red/orange banner)
- Summary line (e.g., "47 jobs failed in email-send (last 5 min)")
- Connection and queue names
- Key context data formatted as a small table
- Primary CTA: "View Queue" → dashboardUrl
- Secondary link: "Mute this alert" → muteUrl
- Footer with "You're receiving this because you configured an alert rule on Durabull"

**File:** `packages/email/src/index.ts` — Add:

```typescript
import { AlertEmail, type AlertEmailProps } from './templates/alert'

export type { AlertEmailProps }

export async function sendAlertNotificationEmail(data: AlertEmailProps & { to: string }): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('[email] RESEND_API_KEY not configured, skipping alert email')
    return
  }

  const { to, ...props } = data
  const html = await render(AlertEmail(props))
  const text = await render(AlertEmail(props), { plainText: true })

  const resend = getResendClient()

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `🚨 Alert: ${props.summary}`,
    html,
    text,
  })

  if (error) {
    console.error('[email] Failed to send alert email:', error)
    throw new Error(`Failed to send alert email: ${error.message}`)
  }

  console.log(`[email] Alert email sent to ${to}`)
}
```

---

## Phase 5: API Routes

### 5A. Connection-Scoped Alert Routes

**File:** `apps/api/src/routes/alerts.ts`

This route file is mounted at `/api/c/:connectionId/alerts` — it runs behind `connectionMiddleware`, so `connectionId`, `connectionUrl`, `connectionName`, and `organizationId` are already available on the context.

```typescript
import { alertEventRepository, alertRuleRepository } from '@durabull/dal'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const app = new Hono()
```

#### Route: List Rules

```typescript
.get('/rules', async (c) => {
  const connectionId = c.get('connectionId')
  const organizationId = c.get('organizationId')!
  const rules = await alertRuleRepository.findByConnection(connectionId, organizationId)
  return c.json({ rules })
})
```

#### Route: Create Rule

```typescript
.post(
  '/rules',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(200),
      type: z.enum(['failure_threshold', 'failure_rate', 'queue_stalled']),
      queueName: z.string().min(1).nullable().optional().default(null),
      config: z.record(z.unknown()),
      notificationChannels: z
        .array(
          z.object({
            type: z.enum(['email']),
            target: z.string().email(),
          })
        )
        .max(10)
        .default([]),
      cooldownMinutes: z.number().int().min(1).max(1440).default(30),
      enabled: z.boolean().default(true),
    })
  ),
  async (c) => {
    const body = c.req.valid('json')
    const connectionId = c.get('connectionId')
    const organizationId = c.get('organizationId')!

    // Validate config shape based on type
    const configError = validateAlertConfig(body.type, body.config)
    if (configError) {
      return c.json({ error: configError }, 400)
    }

    // Limit rules per connection (e.g., 50)
    const count = await alertRuleRepository.countByConnection(connectionId, organizationId)
    if (count >= 50) {
      return c.json({ error: 'Maximum of 50 alert rules per connection' }, 400)
    }

    const rule = await alertRuleRepository.create({
      ...body,
      connectionId,
      organizationId,
    })

    return c.json({ rule }, 201)
  }
)
```

#### Route: Update Rule

```typescript
.patch(
  '/rules/:ruleId',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).max(200).optional(),
      type: z.enum(['failure_threshold', 'failure_rate', 'queue_stalled']).optional(),
      queueName: z.string().min(1).nullable().optional(),
      config: z.record(z.unknown()).optional(),
      notificationChannels: z
        .array(z.object({ type: z.enum(['email']), target: z.string().email() }))
        .max(10)
        .optional(),
      cooldownMinutes: z.number().int().min(1).max(1440).optional(),
      enabled: z.boolean().optional(),
    })
  ),
  async (c) => {
    const { ruleId } = c.req.param()
    const body = c.req.valid('json')
    const organizationId = c.get('organizationId')!

    if (body.type && body.config) {
      const configError = validateAlertConfig(body.type, body.config)
      if (configError) return c.json({ error: configError }, 400)
    }

    const rule = await alertRuleRepository.update(ruleId, organizationId, body)
    if (!rule) return c.json({ error: 'Rule not found' }, 404)

    return c.json({ rule })
  }
)
```

#### Route: Delete Rule

```typescript
.delete('/rules/:ruleId', async (c) => {
  const { ruleId } = c.req.param()
  const organizationId = c.get('organizationId')!

  // Resolve all firing events before deleting
  await alertEventRepository.resolveAllForRule(ruleId)

  const deleted = await alertRuleRepository.delete(ruleId, organizationId)
  if (!deleted) return c.json({ error: 'Rule not found' }, 404)

  return c.json({ success: true })
})
```

#### Route: Test Rule (Dry Run)

```typescript
.post('/rules/:ruleId/test', async (c) => {
  const { ruleId } = c.req.param()
  const organizationId = c.get('organizationId')!
  const connectionId = c.get('connectionId')
  const connectionUrl = c.get('connectionUrl')

  const rule = await alertRuleRepository.findById(ruleId, organizationId)
  if (!rule) return c.json({ error: 'Rule not found' }, 404)

  // Collect live snapshot for the queue (or first discovered queue if rule is for all)
  // Evaluate without firing or persisting
  // Return the evaluation result
  return c.json({ evaluation })
})
```

#### Route: List Events

```typescript
.get(
  '/events',
  zValidator(
    'query',
    z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(['firing', 'resolved', 'suppressed']).optional(),
    })
  ),
  async (c) => {
    const { offset, limit, status } = c.req.valid('query')
    const connectionId = c.get('connectionId')
    const organizationId = c.get('organizationId')!

    const events = await alertEventRepository.findByConnection(
      connectionId,
      organizationId,
      { offset, limit, status }
    )
    return c.json({ events })
  }
)
```

#### Route: Resolve Event

```typescript
.post('/events/:eventId/resolve', async (c) => {
  const { eventId } = c.req.param()
  const organizationId = c.get('organizationId')!

  const event = await alertEventRepository.resolve(eventId, organizationId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  return c.json({ event })
})
```

#### Config Validation Helper

```typescript
function validateAlertConfig(type: string, config: Record<string, unknown>): string | null {
  switch (type) {
    case 'failure_threshold': {
      const schema = z.object({
        count: z.number().int().min(1).max(10000),
        windowMinutes: z.number().int().min(1).max(1440),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    case 'failure_rate': {
      const schema = z.object({
        rate: z.number().min(0.01).max(1),
        windowMinutes: z.number().int().min(1).max(1440),
        minSample: z.number().int().min(1).max(100000),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    case 'queue_stalled': {
      const schema = z.object({
        stalledMinutes: z.number().int().min(1).max(1440),
      })
      const result = schema.safeParse(config)
      return result.success ? null : `Invalid config: ${result.error.message}`
    }
    default:
      return `Unknown alert type: ${type}`
  }
}
```

### 5B. Global Alert Routes

**File:** `apps/api/src/routes/alerts-global.ts`

Mounted at `/api/alerts` — runs behind `sessionMiddleware` + `requireOrganization`.

```typescript
const app = new Hono()
  .use('*', requireOrganization)

  .get(
    '/events',
    zValidator('query', z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(['firing', 'resolved', 'suppressed']).optional(),
    })),
    async (c) => {
      const { offset, limit, status } = c.req.valid('query')
      const organizationId = c.get('organizationId')!
      const events = await alertEventRepository.findByOrganization(organizationId, { offset, limit, status })
      return c.json({ events })
    }
  )

  .get('/summary', async (c) => {
    const organizationId = c.get('organizationId')!
    const counts = await alertEventRepository.countFiringByOrganization(organizationId)
    return c.json({ connections: counts })
  })

export default app
```

---

## Phase 6: Integration (Wiring It All Together)

### 6A. Mount Routes in `apps/api/src/app.ts`

Add imports at the top:

```typescript
import alertsRoutes from './routes/alerts'
import alertsGlobalRoutes from './routes/alerts-global'
```

Add to `apiRoutes` (type inference chain):

```typescript
.route('/c/:connectionId/alerts', alertsRoutes)
.route('/alerts', alertsGlobalRoutes)
```

Add to runtime `api` (middleware-applied chain):

```typescript
// Session middleware for global alerts
api.use('/alerts/*', sessionMiddleware)

// Connection-scoped alerts (connectionMiddleware already applied to /c/:connectionId/*)
api.route('/c/:connectionId/alerts', alertsRoutes)
api.route('/alerts', alertsGlobalRoutes)
```

### 6B. Start/Stop Monitor in `apps/api/src/index.ts`

Add import:

```typescript
import { startAlertMonitor, stopAlertMonitor } from './lib/alert-monitor'
```

Start after server creation (after the startup banner):

```typescript
// Start background alert monitoring
startAlertMonitor()
```

Add to shutdown function:

```typescript
async function shutdown(reason: NodeJS.Signals): Promise<void> {
  // ... existing code ...
  shutdownPromise = (async () => {
    console.log(`[shutdown] Received ${reason}, stopping alert monitor...`)
    stopAlertMonitor()

    console.log(`[shutdown] Closing database...`)
    // ... existing closeDb() ...
  })()
}
```

Add to startup banner:

```typescript
const alertBanner = '🔔 Alerts: Monitor active'
```

### 6C. Environment Variables

**File:** `tooling/env/src/index.ts` — Add these optional vars:

```typescript
DURABULL_ALERT_POLL_INTERVAL_MS: optionalInt(),  // Default: 60000
DURABULL_ALERT_ENABLED: optionalBool(),           // Default: true
```

These are optional. The monitor defaults to enabled with a 60s interval. Setting `DURABULL_ALERT_ENABLED=false` disables the background monitor entirely (useful for dev).

**File:** `.env.example` — Add section:

```
# Alerting
# DURABULL_ALERT_ENABLED=true           # Enable/disable background alert monitor
# DURABULL_ALERT_POLL_INTERVAL_MS=60000 # Alert polling interval in ms (default: 60s)
```

---

## Deduplication Deep Dive

### Layer 1: Delta-based detection (alert_check_cursor)

We track failed/completed counts at each poll and compute deltas:

```
Poll at T1: failed_count = 100, cursor says last was 95 → delta = 5
Poll at T2: failed_count = 112, cursor says last was 100 → delta = 12
Poll at T3: failed_count = 112, cursor says last was 112 → delta = 0 (no new failures)
```

Old/retried failures don't re-trigger alerts.

### Layer 2: Cooldown (alert_rule.cooldown_minutes)

Even if new failures keep coming, we only fire one alert per cooldown window:

```
Alert fires at T1 (cooldown = 30 min)
New failures at T1+5min → suppressed
New failures at T1+35min → new alert fires
```

### Layer 3: Firing/resolved state (alert_event.status)

An alert stays `firing` until manually resolved or auto-resolved when the condition clears.

### Edge Cases to Handle

- **Server restart:** Cursor persists in Postgres. First poll after restart computes delta from last known state. May miss failures during downtime — acceptable, not a critical gap.
- **Queue deleted from Redis:** Cursor stays orphaned in Postgres. The cleanup job (below) handles this.
- **Connection deleted:** CASCADE deletes all rules, events, and cursors.
- **Rule disabled mid-cycle:** `findAllEnabled()` only returns enabled rules, so disabled rules are skipped on next poll.
- **BullMQ metrics disabled:** If `queue.getMetrics()` returns empty data, `failure_rate` and `queue_stalled` won't trigger. `failure_threshold` still works via `getJobCounts()` delta.

---

## Cleanup & Retention

Add a periodic cleanup that runs alongside the poll cycle (e.g., once per hour):

```typescript
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const EVENT_RETENTION_DAYS = 90

async function runCleanup(): Promise<void> {
  const deleted = await alertEventRepository.deleteOlderThan(EVENT_RETENTION_DAYS)
  if (deleted > 0) {
    console.log(`[alert-monitor] Cleaned up ${deleted} old alert events`)
  }
}
```

---

## Resource & Scalability Notes

### Redis Connection Overhead

The monitor reuses `getRedis()` and `getQueue()` from `apps/api/src/lib/redis.ts`. No new connections. Cost per connection: ~3-5 Redis commands per queue per cycle.

### Postgres Load

Per cycle: 1 query to load rules, N upserts to cursors, 0-few inserts to events. Negligible.

### Multi-Instance Deployment (Future)

Use `SELECT ... FOR UPDATE SKIP LOCKED` on `alert_check_cursor` rows so only one instance processes each connection. Not needed for single-instance deployments.

---

## What We Explicitly Don't Need

- **Separate microservice** — Runs inside the existing API process
- **Message broker** — Postgres is the state layer
- **WebSockets** — Frontend polls on the same interval as everything else
- **Per-job tracking** — Queue-level metrics, not individual job IDs
- **Real-time streaming** — 60s polling is fast enough for alerting

---

## Complete File Changes Summary

### New Files

```
packages/dal/src/db/schemas/alert-rule/
  schema.ts                              — AlertRule table definition
  types.ts                               — AlertRule, NewAlertRule types

packages/dal/src/db/schemas/alert-event/
  schema.ts                              — AlertEvent table definition
  types.ts                               — AlertEvent, NewAlertEvent types

packages/dal/src/db/schemas/alert-check-cursor/
  schema.ts                              — AlertCheckCursor table definition
  types.ts                               — AlertCheckCursor, NewAlertCheckCursor types

packages/dal/src/repositories/
  alert-rule.ts                          — CRUD + findAllEnabled()
  alert-event.ts                         — CRUD + dedup queries + cleanup
  alert-check-cursor.ts                  — Upsert + batch load

apps/api/src/lib/
  alert-evaluator.ts                     — Pure evaluation functions
  alert-monitor.ts                       — Background poll loop
  alert-notifier.ts                      — Notification dispatch

apps/api/src/routes/
  alerts.ts                              — Connection-scoped alert API
  alerts-global.ts                       — Org-scoped alert summary API

packages/email/src/templates/
  alert.tsx                              — Alert email React component
```

### Modified Files

```
packages/dal/src/db/schemas/tables.ts    — Add alert table exports
packages/dal/src/db/schemas/index.ts     — Add alert schema exports
packages/dal/src/db/schemas/relations.ts — Add alert relations
packages/dal/src/index.ts                — Add alert DAL exports

apps/api/src/app.ts                      — Import + mount alert routes
apps/api/src/index.ts                    — Start/stop alert monitor

packages/email/src/index.ts              — Add sendAlertNotificationEmail export

tooling/env/src/index.ts                 — Add DURABULL_ALERT_* env vars
.env.example                             — Document new env vars
```

### Generated Files (do not write by hand)

```
packages/dal/src/db/migrations/YYYYMMDD_*/migration.sql — Generated by `bunx drizzle-kit generate`
```

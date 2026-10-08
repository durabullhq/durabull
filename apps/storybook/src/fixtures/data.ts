import type { AlertEventRecord, AlertRuleRecord } from '@/hooks/use-alerts'
/** Invented, deterministic public examples. Never load database or .env data here. */
export const timestamp = Date.parse('2026-10-08T12:00:00Z')
export const user = {
  id: 'demo-user',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  image: null,
  emailVerified: true,
  createdAt: new Date('2026-01-01'),
}
export const organizationFixture = {
  id: 'demo-org',
  name: 'Acme Operations',
  slug: 'acme',
  logo: null,
  createdAt: new Date('2026-01-01'),
}
export const members = [
  {
    id: 'demo-member',
    userId: user.id,
    organizationId: 'demo-org',
    role: 'owner',
    createdAt: new Date('2026-01-01'),
    user,
  },
]
export const connections = [
  {
    id: 'demo-redis',
    name: 'Production',
    environment: 'production',
    prefix: 'bull',
    isDefault: true,
    organizationId: 'demo-org',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    redisUrl: 'redis://localhost:6379',
    source: 'database',
  },
  {
    id: 'demo-staging',
    name: 'Staging',
    environment: 'staging',
    prefix: 'bull',
    isDefault: false,
    organizationId: 'demo-org',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    redisUrl: 'redis://localhost:6380',
    source: 'database',
  },
]
export const counts = {
  waiting: 128,
  active: 12,
  delayed: 8,
  completed: 84592,
  failed: 7,
  paused: 0,
  prioritized: 3,
}
export const queues = ['email:receipts', 'image:resize', 'billing:invoices'].map((name, index) => ({
  name,
  status: index === 2 ? 'paused' : 'active',
  isPaused: index === 2,
  discoveryState: 'confirmed',
  jobCounts: { ...counts, waiting: 128 - index * 30 },
}))
export const payload = {
  orderId: 'order-1042',
  recipient: 'customer@example.com',
  items: [{ sku: 'durabull-shirt', quantity: 2 }],
  metadata: { source: 'storefront', sandbox: true },
}
export const job = {
  id: 'job-1042',
  name: 'send-receipt',
  queueName: queues[0].name,
  status: 'failed',
  data: payload,
  opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  progress: 0,
  attemptsMade: 3,
  maxAttempts: 3,
  failedReason: 'Demo email provider returned HTTP 503.',
  stacktraceCount: 3,
  timestamp,
  processedOn: timestamp + 1000,
  finishedOn: timestamp + 2000,
  delay: 0,
  priority: 0,
  returnvalue: null,
  stacktrace: ['Error: Demo provider unavailable\n    at sendReceipt (worker.ts:42:11)'],
}
export const jobs = ['failed', 'active', 'completed', 'waiting', 'delayed'].map(
  (status, index) => ({
    ...job,
    id: `job-${1042 + index}`,
    status,
    attemptsMade: status === 'failed' ? 3 : 1,
  })
)
export const rule: AlertRuleRecord = {
  id: 'demo-rule',
  organizationId: 'demo-org',
  connectionId: 'demo-redis',
  queueName: null,
  queueFilterMode: 'include',
  filterQueueNames: ['email:receipts'],
  name: 'Receipt delivery failures',
  type: 'failure_threshold',
  config: { count: 5, windowMinutes: 5 },
  enabled: true,
  notificationChannels: [{ type: 'email', target: 'ops@example.com' }],
  cooldownMinutes: 30,
  mutedUntil: null,
  state: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}
export const event: AlertEventRecord = {
  id: 'demo-incident',
  alertRuleId: rule.id,
  organizationId: 'demo-org',
  connectionId: 'demo-redis',
  queueName: 'email:receipts',
  type: 'failure_threshold',
  status: 'firing',
  summary: '7 receipt deliveries failed within 5 minutes',
  context: { failureCount: 7, windowMinutes: 5 },
  firedAt: '2026-10-08T12:00:00Z',
  resolvedAt: null,
  notificationSentAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  acknowledgedByName: null,
  deliveries: [],
}
export const destinations = [
  {
    id: 'demo-destination',
    organizationId: 'demo-org',
    name: 'Operations email',
    type: 'email',
    config: { email: 'ops@example.com', recipients: ['ops@example.com'] },
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]
export const scheduler = {
  schedulerId: 'daily-summary',
  queueName: 'email:receipts',
  jobName: 'send-summary',
  pattern: '0 9 * * *',
  timezone: 'UTC',
  nextRun: timestamp + 86400000,
  enabled: true,
  iterationCount: 32,
  recentFailedCount: 1,
  lastFailedAt: timestamp,
  data: payload,
  templateOptions: { attempts: 3 },
}
export const workers = [
  {
    id: 'demo-worker',
    name: 'worker-us-west',
    addr: '127.0.0.1:6379',
    address: '127.0.0.1',
    age: 3600,
    idle: 1,
    db: 0,
    queueName: 'email:receipts',
    connectionName: 'Production',
  },
]
export const discovery = {
  running: false,
  indexed: { total: 3, confirmed: 3, pending: 0 },
  lastCompletedAt: '2026-10-08T12:00:00Z',
  lastStartedAt: '2026-10-08T12:00:00Z',
  lastError: null,
}

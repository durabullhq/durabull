/**
 * Seed Script Configuration
 *
 * Centralizes all configuration constants for the seed script including
 * organization definitions, user credentials, connection settings, and
 * queue configurations.
 */

// ============================================================================
// Environment Configuration
// ============================================================================

function defaultRedisUrlFromEnv(): string {
  const port = process.env.DURABULL_REDIS_PORT?.trim()
  if (port) return `redis://localhost:${port}`
  // Matches tooling/docker default host port when DURABULL_REDIS_PORT is unset (see docker-compose.yaml).
  return 'redis://localhost:56379'
}

// Use a getter function to read REDIS_URL at runtime (not import time)
// This allows the demo seed script to override process.env.REDIS_URL before use
export function getRedisUrl(): string {
  return process.env.REDIS_URL || defaultRedisUrlFromEnv()
}

// Legacy export for backwards compatibility (evaluated at import time)
export const REDIS_URL = process.env.REDIS_URL || defaultRedisUrlFromEnv()

// ============================================================================
// User Definitions
// ============================================================================

export const USERS = {
  admin: {
    id: '01900000-0000-7000-8000-000000000001',
    email: 'admin@example.com',
    name: 'Sarah Chen',
    password: 'password',
  },
  developer: {
    id: '01900000-0000-7000-8000-000000000002',
    email: 'developer@example.com',
    name: 'Marcus Johnson',
    password: 'password',
  },
  lead: {
    id: '01900000-0000-7000-8000-000000000003',
    email: 'lead@example.com',
    name: 'Emily Rodriguez',
    password: 'password',
  },
} as const

// ============================================================================
// Organization Definitions
// ============================================================================

export const ORGANIZATIONS = {
  acme: {
    id: '01900000-0000-7000-8000-000000000010',
    name: 'Acme Corporation',
    slug: 'acme',
  },
  techstart: {
    id: '01900000-0000-7000-8000-000000000011',
    name: 'TechStart Inc',
    slug: 'techstart',
  },
  personal: {
    id: '01900000-0000-7000-8000-000000000012',
    name: 'Personal Projects',
    slug: 'personal',
  },
} as const

// ============================================================================
// Redis Connection Definitions
// ============================================================================

export type ConnectionEnvironment = 'development' | 'staging' | 'production'

export interface ConnectionConfig {
  id: string
  name: string
  environment: ConnectionEnvironment
  organizationId: string
  isDefault: boolean
  isPrimaryTest: boolean // The connection that gets ALL test data
}

export const CONNECTIONS: ConnectionConfig[] = [
  {
    id: '01900000-0000-7000-8000-000000000020',
    name: 'Acme Production',
    environment: 'production',
    organizationId: ORGANIZATIONS.acme.id,
    isDefault: true,
    isPrimaryTest: true, // PRIMARY TEST CONNECTION - all test data here
  },
  {
    id: '01900000-0000-7000-8000-000000000021',
    name: 'Acme Staging',
    environment: 'staging',
    organizationId: ORGANIZATIONS.acme.id,
    isDefault: false,
    isPrimaryTest: false,
  },
  {
    id: '01900000-0000-7000-8000-000000000022',
    name: 'Acme Development',
    environment: 'development',
    organizationId: ORGANIZATIONS.acme.id,
    isDefault: false,
    isPrimaryTest: false,
  },
  {
    id: '01900000-0000-7000-8000-000000000023',
    name: 'TechStart Production',
    environment: 'production',
    organizationId: ORGANIZATIONS.techstart.id,
    isDefault: true,
    isPrimaryTest: false,
  },
  {
    id: '01900000-0000-7000-8000-000000000024',
    name: 'Personal Dev',
    environment: 'development',
    organizationId: ORGANIZATIONS.personal.id,
    isDefault: true,
    isPrimaryTest: false,
  },
]

// Get the primary test connection
export const PRIMARY_TEST_CONNECTION = CONNECTIONS.find((c) => c.isPrimaryTest)!

// ============================================================================
// Queue Definitions
// ============================================================================

export interface QueueConfig {
  name: string
  category: string
  description: string
  isPaused?: boolean
  jobTypes: {
    name: string
    weight: number // Higher weight = more jobs of this type
  }[]
  workerConfig?: {
    count: number
    concurrency: number
    rateLimit: { max: number; duration: number }
  }
  scheduledJobs?: {
    name: string
    pattern: string
    description: string
  }[]
}

export const QUEUE_CONFIGS: QueueConfig[] = [
  // Payment & Billing
  {
    name: 'payment-processing',
    category: 'Payment & Billing',
    description: 'Credit card charges, refunds, subscriptions',
    jobTypes: [
      { name: 'charge-card', weight: 5 },
      { name: 'process-refund', weight: 2 },
      { name: 'renew-subscription', weight: 3 },
      { name: 'update-payment-method', weight: 1 },
    ],
    workerConfig: {
      count: 3,
      concurrency: 5,
      rateLimit: { max: 50, duration: 60000 },
    },
  },
  {
    name: 'invoice-generation',
    category: 'Payment & Billing',
    description: 'PDF generation, email delivery',
    jobTypes: [
      { name: 'generate-invoice-pdf', weight: 4 },
      { name: 'send-invoice-email', weight: 4 },
      { name: 'generate-receipt', weight: 2 },
    ],
    scheduledJobs: [
      { name: 'monthly-invoice-batch', pattern: '0 0 1 * *', description: '1st of month' },
    ],
  },

  // User Management
  {
    name: 'user-registration',
    category: 'User Management',
    description: 'Account creation, verification emails, profile setup',
    jobTypes: [
      { name: 'create-account', weight: 4 },
      { name: 'send-verification-email', weight: 4 },
      { name: 'setup-default-workspace', weight: 2 },
      { name: 'sync-to-crm', weight: 1 },
    ],
  },
  {
    name: 'user-notifications',
    category: 'User Management',
    description: 'Push notifications, in-app messages, digests',
    jobTypes: [
      { name: 'send-push-notification', weight: 5 },
      { name: 'create-in-app-message', weight: 3 },
      { name: 'send-activity-digest', weight: 2 },
    ],
    scheduledJobs: [
      { name: 'daily-digest', pattern: '0 8 * * *', description: '8 AM daily' },
      { name: 'weekly-summary', pattern: '0 9 * * 1', description: 'Monday 9 AM' },
    ],
  },

  // Media & Files
  {
    name: 'image-processing',
    category: 'Media & Files',
    description: 'Resize, compress, thumbnail generation',
    jobTypes: [
      { name: 'resize-image', weight: 4 },
      { name: 'compress-image', weight: 3 },
      { name: 'generate-thumbnail', weight: 4 },
      { name: 'extract-metadata', weight: 1 },
    ],
    workerConfig: {
      count: 2,
      concurrency: 3,
      rateLimit: { max: 30, duration: 60000 },
    },
  },
  {
    name: 'video-transcoding',
    category: 'Media & Files',
    description: 'Format conversion, HLS streaming prep',
    jobTypes: [
      { name: 'transcode-720p', weight: 3 },
      { name: 'transcode-1080p', weight: 3 },
      { name: 'generate-hls-playlist', weight: 2 },
      { name: 'extract-audio', weight: 1 },
    ],
    workerConfig: {
      count: 1,
      concurrency: 1,
      rateLimit: { max: 5, duration: 60000 },
    },
  },

  // Data & Analytics
  {
    name: 'analytics-pipeline',
    category: 'Data & Analytics',
    description: 'Event aggregation, report generation',
    jobTypes: [
      { name: 'aggregate-events', weight: 4 },
      { name: 'calculate-metrics', weight: 3 },
      { name: 'update-dashboard-cache', weight: 2 },
      { name: 'generate-insights', weight: 1 },
    ],
    scheduledJobs: [
      { name: 'daily-aggregation', pattern: '0 2 * * *', description: '2 AM daily' },
      { name: 'hourly-metrics', pattern: '0 * * * *', description: 'Every hour' },
    ],
  },
  {
    name: 'data-export',
    category: 'Data & Analytics',
    description: 'CSV/JSON exports, GDPR compliance',
    jobTypes: [
      { name: 'export-to-csv', weight: 3 },
      { name: 'export-to-json', weight: 2 },
      { name: 'gdpr-data-request', weight: 1 },
      { name: 'gdpr-deletion-request', weight: 1 },
    ],
  },

  // Communication
  {
    name: 'email-delivery',
    category: 'Communication',
    description: 'Transactional emails, marketing campaigns',
    jobTypes: [
      { name: 'send-transactional', weight: 5 },
      { name: 'send-marketing', weight: 3 },
      { name: 'send-password-reset', weight: 2 },
      { name: 'send-welcome-email', weight: 2 },
    ],
    workerConfig: {
      count: 2,
      concurrency: 10,
      rateLimit: { max: 100, duration: 60000 },
    },
    scheduledJobs: [
      { name: 'digest-emails', pattern: '0 8 * * *', description: '8 AM daily' },
    ],
  },
  {
    name: 'webhook-dispatch',
    category: 'Communication',
    description: 'External integrations, retry logic',
    jobTypes: [
      { name: 'dispatch-webhook', weight: 5 },
      { name: 'verify-webhook-signature', weight: 1 },
      { name: 'retry-failed-webhook', weight: 2 },
    ],
    workerConfig: {
      count: 2,
      concurrency: 8,
      rateLimit: { max: 200, duration: 60000 },
    },
  },

  // Background Tasks
  {
    name: 'scheduled-reports',
    category: 'Background Tasks',
    description: 'Daily/weekly/monthly reports',
    isPaused: true, // This queue is paused to test pause/resume UI
    jobTypes: [
      { name: 'generate-daily-report', weight: 3 },
      { name: 'generate-weekly-report', weight: 2 },
      { name: 'generate-monthly-report', weight: 1 },
      { name: 'send-report-email', weight: 3 },
    ],
    scheduledJobs: [
      { name: 'weekly-summary', pattern: '0 9 * * 1', description: 'Monday 9 AM' },
      { name: 'monthly-billing', pattern: '0 0 1 * *', description: '1st of month' },
    ],
  },
  {
    name: 'cleanup-tasks',
    category: 'Background Tasks',
    description: 'Data retention, cache invalidation',
    jobTypes: [
      { name: 'cleanup-expired-sessions', weight: 3 },
      { name: 'purge-old-logs', weight: 2 },
      { name: 'invalidate-cache', weight: 3 },
      { name: 'archive-old-data', weight: 1 },
    ],
    scheduledJobs: [
      { name: 'session-cleanup', pattern: '*/15 * * * *', description: 'Every 15 min' },
      { name: 'data-retention', pattern: '0 3 * * 0', description: 'Sunday 3 AM' },
    ],
  },
]

// ============================================================================
// Job Distribution Configuration
// ============================================================================

export const JOB_DISTRIBUTION = {
  // Number of jobs per state (ranges for variety)
  waiting: { min: 50, max: 200 },
  active: { min: 3, max: 10 },
  completed: { min: 100, max: 500 },
  failed: { min: 10, max: 50 },
  delayed: { min: 20, max: 100 },
  prioritized: { min: 10, max: 30 },
}

// Delayed job time distribution
export const DELAYED_TIME_DISTRIBUTION = [
  { delay: 30 * 1000, count: 5, label: '30 seconds' },
  { delay: 1 * 60 * 1000, count: 3, label: '1 minute' },
  { delay: 3 * 60 * 1000, count: 4, label: '3 minutes' },
  { delay: 5 * 60 * 1000, count: 3, label: '5 minutes' },
  { delay: 15 * 60 * 1000, count: 8, label: '15 minutes' },
  { delay: 30 * 60 * 1000, count: 7, label: '30 minutes' },
  { delay: 1 * 60 * 60 * 1000, count: 10, label: '1 hour' },
  { delay: 2 * 60 * 60 * 1000, count: 10, label: '2 hours' },
  { delay: 6 * 60 * 60 * 1000, count: 8, label: '6 hours' },
  { delay: 12 * 60 * 60 * 1000, count: 7, label: '12 hours' },
  { delay: 24 * 60 * 60 * 1000, count: 5, label: '1 day' },
  { delay: 48 * 60 * 60 * 1000, count: 5, label: '2 days' },
  { delay: 72 * 60 * 60 * 1000, count: 3, label: '3 days' },
  { delay: 168 * 60 * 60 * 1000, count: 2, label: '7 days' },
]

// ============================================================================
// Redis Keys Configuration
// ============================================================================

export const REDIS_KEY_PREFIXES = [
  { prefix: 'session:', count: 50, ttl: 24 * 60 * 60, description: 'User sessions' },
  { prefix: 'cache:user:', count: 30, ttl: 60 * 60, description: 'User profile cache' },
  { prefix: 'cache:api:', count: 40, ttl: 5 * 60, description: 'API response cache' },
  { prefix: 'rate:', count: 25, ttl: 60, description: 'Rate limiting' },
  { prefix: 'lock:', count: 10, ttl: 30, description: 'Distributed locks' },
  { prefix: 'config:', count: 15, ttl: null, description: 'Configuration (no TTL)' },
  { prefix: 'analytics:', count: 20, ttl: 7 * 24 * 60 * 60, description: 'Analytics data' },
]

// ============================================================================
// Invitation Configuration
// ============================================================================

export const PENDING_INVITATIONS = [
  {
    email: 'newdev@example.com',
    role: 'member',
    organizationId: ORGANIZATIONS.acme.id,
    inviterId: USERS.admin.id,
  },
  {
    email: 'contractor@agency.com',
    role: 'member',
    organizationId: ORGANIZATIONS.acme.id,
    inviterId: USERS.lead.id,
  },
  {
    email: 'manager@techstart.com',
    role: 'admin',
    organizationId: ORGANIZATIONS.techstart.id,
    inviterId: USERS.admin.id,
  },
]

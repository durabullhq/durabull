/**
 * Published Durabull Cloud pricing. Mirrors the server-side catalog in
 * `packages/billing/src/catalog.ts`; `pricing.test.ts` fails if they drift, so
 * marketing copy cannot promise more (or less) than the product enforces.
 */

export type CloudPlanCode = 'free' | 'team' | 'business' | 'enterprise'

export interface CloudPlan {
  code: CloudPlanCode
  name: string
  description: string
  monthlyPriceUsd: number | null
  annualPriceUsd: number | null
  limits: {
    connections: number
    members: number
    alertRules: number
    destinations: number
    serviceAccounts: number
    historyDays: number
  }
  features: {
    bulkRecovery: boolean
    mcpWrites: boolean
    webhookAlerts: boolean
    linearAlerts: boolean
  }
  support: string
  cta: { label: string; href: 'signup' | 'contact' }
  highlighted?: boolean
}

export const CLOUD_PLANS: CloudPlan[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'One developer inspecting one production Redis database.',
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    limits: {
      connections: 1,
      members: 1,
      alertRules: 3,
      destinations: 1,
      serviceAccounts: 0,
      historyDays: 1,
    },
    features: { bulkRecovery: false, mcpWrites: false, webhookAlerts: false, linearAlerts: false },
    support: 'Community and documentation',
    cta: { label: 'Start free', href: 'signup' },
  },
  {
    code: 'team',
    name: 'Team',
    description: 'Shared operations across your environments for one team price.',
    monthlyPriceUsd: 9,
    annualPriceUsd: 90,
    limits: {
      connections: 5,
      members: 10,
      alertRules: 15,
      destinations: 5,
      serviceAccounts: 1,
      historyDays: 14,
    },
    features: { bulkRecovery: true, mcpWrites: true, webhookAlerts: true, linearAlerts: true },
    support: 'Email, best effort',
    cta: { label: 'Start with Team', href: 'signup' },
    highlighted: true,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'More databases, people, automation and history.',
    monthlyPriceUsd: 29,
    annualPriceUsd: 290,
    limits: {
      connections: 15,
      members: 50,
      alertRules: 100,
      destinations: 20,
      serviceAccounts: 5,
      historyDays: 30,
    },
    features: { bulkRecovery: true, mcpWrites: true, webhookAlerts: true, linearAlerts: true },
    support: 'Priority email, target 2 business days',
    cta: { label: 'Try Business free for 14 days', href: 'signup' },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Contracted capacity and procurement support on shared Cloud.',
    monthlyPriceUsd: null,
    annualPriceUsd: null,
    limits: {
      connections: 30,
      members: 100,
      alertRules: 250,
      destinations: 50,
      serviceAccounts: 25,
      historyDays: 30,
    },
    features: { bulkRecovery: true, mcpWrites: true, webhookAlerts: true, linearAlerts: true },
    support: 'Agreed business-hours support',
    cta: { label: 'Contact sales', href: 'contact' },
  },
]

/** One-line summary reused by FAQ, comparison pages and generated LLM text. */
export const CLOUD_PRICING_SUMMARY =
  'Durabull Cloud is billed per organization: Free $0 (1 connection), Team $9/month or $90/year (5 connections, 10 members), Business $29/month or $290/year (15 connections, 50 members), and Enterprise by agreement. No per-job fees. Self-hosting under Apache-2.0 needs no subscription.'

/** Dashboard fee label for cost-comparison rows (infrastructure is separate). */
export const DURABULL_DASHBOARD_FEE = 'Free, $9 or $29/mo per org'

/** Short form for comparison tables. */
export const CLOUD_PRICING_SHORT = 'Free; Team $9/mo; Business $29/mo (per organization)'

export function effectiveMonthly(annualUsd: number): string {
  return (Math.round((annualUsd / 12) * 100) / 100).toFixed(2)
}

export const PRICING_FAQS = [
  {
    question: 'What does a plan include?',
    answer:
      'Plans are priced per organization, not per person. Every plan includes all queues discovered on its enabled Redis connections, job inspection, individual retries and email alerts. There are no per-job, per-retry or per-MCP-call fees.',
  },
  {
    question: 'What counts as a connection?',
    answer:
      'Each enabled connection to a Redis logical database counts once, however many queues it holds. Disabled connections stop polling and do not count. A different logical database is a separate connection.',
  },
  {
    question: 'Who counts as a member?',
    answer:
      'The owner and active members count, and pending invitations reserve a seat until they are accepted, revoked or expire. Service accounts have their own limit and cannot sign in interactively.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes. Verified organizations can start one 14-day Business trial without a payment method. If no payment method is added, the organization returns to Free at the end of the trial.',
  },
  {
    question: 'What happens if I downgrade or cancel?',
    answer:
      'Cancellation takes effect at the end of the paid period. After a downgrade, existing resources above the new limits stay enabled for seven days; then the newest extras are paused, never deleted, and you choose what stays enabled. Billing never pauses your queues, deletes jobs or changes your Redis data.',
  },
  {
    question: 'What if a payment fails?',
    answer:
      'Previously paid plans keep working for a seven-day grace period while you update your payment method through the hosted billing portal.',
  },
  {
    question: 'How do annual plans work?',
    answer:
      'Annual plans are prepaid: Team is $90 per year (equivalent to $7.50 per month) and Business is $290 per year (about $24.17 per month). Plan changes are prorated by Stripe; unused amounts from a downgrade normally become account credit.',
  },
  {
    question: 'Do I need a subscription to self-host?',
    answer:
      'No. Durabull is open source under Apache-2.0. The desktop app and self-hosted installations include every local feature without a Cloud subscription and never contact Stripe.',
  },
  {
    question: 'Are taxes included?',
    answer:
      'Prices are in US dollars before applicable taxes. Payment, invoices, receipts and tax IDs are handled by Stripe-hosted checkout and billing pages.',
  },
] as const

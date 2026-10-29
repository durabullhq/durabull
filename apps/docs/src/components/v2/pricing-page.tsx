'use client'

import { ArrowRight, Check, Minus } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import { CONTACT_EMAIL, WEB_APP_URL } from '@/lib/config'
import { CLOUD_PLANS, type CloudPlan, effectiveMonthly, PRICING_FAQS } from '@/lib/pricing'
import { FaqSection } from './faq'
import { Eyebrow, Reveal } from './reveal'
import { DrawnCheck, TiltCard } from './tilt-card'

type Interval = 'month' | 'year'

function historyLabel(days: number): string {
  return days === 1 ? '24 hours' : `${days} days`
}

/** Enterprise limits are contractual floors, so they read "From N". */
function limitPrefix(plan: CloudPlan): string {
  return plan.code === 'enterprise' ? 'From ' : ''
}

function planLimit(plan: CloudPlan, limit: number): string {
  return `${limitPrefix(plan)}${limit}`
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function PlanPrice({ plan, interval }: { plan: CloudPlan; interval: Interval }) {
  let amount: string
  let note: string
  let perMonth = true
  if (plan.monthlyPriceUsd === null || plan.annualPriceUsd === null) {
    amount = 'Custom'
    note = 'Annual agreement'
    perMonth = false
  } else if (plan.monthlyPriceUsd === 0) {
    amount = '$0'
    note = 'Free forever'
  } else if (interval === 'year') {
    amount = `$${effectiveMonthly(plan.annualPriceUsd)}`
    note = `Billed $${plan.annualPriceUsd} annually per organization`
  } else {
    amount = `$${plan.monthlyPriceUsd}`
    note = 'Per organization, billed monthly'
  }

  return (
    <div>
      <p className="v2-h text-4xl text-[var(--v2-fg)]">
        {amount}
        {perMonth ? (
          <span className="ml-0.5 text-sm font-medium tracking-normal text-[var(--v2-muted)]">
            /month
          </span>
        ) : null}
      </p>
      <p className="v2-mono mt-2 text-[10.5px] text-[var(--v2-muted)]">{note}</p>
    </div>
  )
}

function planHighlights(plan: CloudPlan): string[] {
  const prefix = limitPrefix(plan)
  return [
    `${prefix}${countOf(plan.limits.connections, 'Redis connection')}`,
    `${prefix}${countOf(plan.limits.members, 'member')}`,
    'All queues on included connections',
    `${prefix}${plan.limits.alertRules} enabled alert rules`,
    `${historyLabel(plan.limits.historyDays)} of Redis health history`,
    plan.features.webhookAlerts ? 'Email, webhook and Linear alerts' : 'Email alerts',
    plan.features.mcpWrites ? 'MCP reads and opt-in writes' : 'Read-only MCP',
    plan.limits.serviceAccounts > 0
      ? `${prefix}${countOf(plan.limits.serviceAccounts, 'service account')}`
      : 'No service accounts',
    plan.support,
  ]
}

function IntervalToggle({
  interval,
  onChange,
}: {
  interval: Interval
  onChange: (value: Interval) => void
}) {
  return (
    <fieldset className="v2-chip m-0 inline-flex min-w-0 rounded-lg p-1">
      <legend className="sr-only">Billing interval</legend>
      {(['month', 'year'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={interval === value}
          onClick={() => onChange(value)}
          className={`whitespace-nowrap rounded-md px-4 py-2 text-[13px] font-medium transition-colors ${
            interval === value
              ? 'v2-btn-primary'
              : 'text-[var(--v2-muted)] hover:text-[var(--v2-fg)]'
          }`}
        >
          {value === 'month' ? 'Monthly' : 'Annual · 2 months free'}
        </button>
      ))}
    </fieldset>
  )
}

/** Plan cards with the billing-interval toggle. */
export function V2PricingPlans() {
  const [interval, setInterval] = useState<Interval>('month')
  const posthog = usePostHog()

  useEffect(() => {
    if (posthog && (posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture('pricing_viewed', { page: '/pricing' })
    }
  }, [posthog])

  return (
    <section id="plans" className="relative scroll-mt-20 bg-[var(--v2-bg)] py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <Eyebrow>Durabull Cloud plans</Eyebrow>
            <h2 className="v2-h mt-4 text-balance text-3xl leading-tight sm:text-4xl">
              Start free. Upgrade when your team does.
            </h2>
          </div>
          <IntervalToggle interval={interval} onChange={setInterval} />
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {CLOUD_PLANS.map((plan, i) => (
            <Reveal key={plan.code} delay={0.06 * i} className="h-full">
              <TiltCard featured={plan.highlighted}>
                <div className="flex items-center justify-between">
                  <h3
                    className={`v2-h text-lg ${
                      plan.highlighted ? 'v2-premium-title' : 'text-[var(--v2-fg)]'
                    }`}
                  >
                    {plan.name}
                  </h3>
                  {plan.highlighted ? (
                    <span className="v2-premium-badge v2-mono text-[10px]">
                      Most teams start here
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 min-h-[3.25rem] text-[13.5px] leading-relaxed text-[var(--v2-muted)]">
                  {plan.description}
                </p>

                <div className="mt-5 border-t border-[var(--v2-line)] pt-5">
                  <PlanPrice plan={plan} interval={interval} />
                </div>

                <ul className="mt-6 grid flex-1 content-start gap-2.5">
                  {planHighlights(plan).map((item, j) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[13.5px] leading-snug text-[var(--v2-fg)]"
                    >
                      <span className="mt-px">
                        <DrawnCheck delay={0.15 + j * 0.04} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>

                <a
                  href={
                    plan.cta.href === 'contact'
                      ? `mailto:${CONTACT_EMAIL}?subject=Durabull%20Enterprise`
                      : `${WEB_APP_URL}/signup`
                  }
                  className={`group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold ${
                    plan.highlighted ? 'v2-btn-accent' : 'v2-btn-ghost'
                  }`}
                >
                  {plan.cta.label}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </a>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-[var(--v2-muted)]">
          Prices in USD before applicable taxes. Upgrade from Free inside the app; a 14-day Business
          trial needs no card.
        </p>
      </div>
    </section>
  )
}

const MATRIX: Array<{ label: string; value: (plan: CloudPlan) => string | boolean }> = [
  { label: 'Enabled Redis connections', value: (p) => planLimit(p, p.limits.connections) },
  { label: 'Members (incl. pending invitations)', value: (p) => planLimit(p, p.limits.members) },
  { label: 'Queues on included connections', value: () => 'All' },
  { label: 'Fees per job, retry or MCP call', value: () => 'None' },
  { label: 'Inspect jobs, logs, queues and workers', value: () => true },
  { label: 'Individual job retry', value: () => true },
  { label: 'Bulk retry and promote', value: (p) => p.features.bulkRecovery },
  { label: 'Read-only MCP for members', value: () => true },
  { label: 'Opt-in MCP write operations', value: (p) => p.features.mcpWrites },
  {
    label: 'Service accounts',
    value: (p) => p.limits.serviceAccounts > 0 && planLimit(p, p.limits.serviceAccounts),
  },
  { label: 'Enabled alert rules', value: (p) => planLimit(p, p.limits.alertRules) },
  { label: 'Saved alert destinations', value: (p) => planLimit(p, p.limits.destinations) },
  { label: 'Email alerts', value: () => true },
  { label: 'Webhook alerts', value: (p) => p.features.webhookAlerts },
  { label: 'Linear alerts', value: (p) => p.features.linearAlerts },
  { label: 'Redis health history', value: (p) => historyLabel(p.limits.historyDays) },
  { label: 'Support', value: (p) => p.support },
]

function MatrixCell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto size-4 text-[var(--v2-accent)]" aria-label="Included" />
  if (value === false)
    return <Minus className="mx-auto size-4 text-[var(--v2-faint)]" aria-label="Not included" />
  return <span>{value}</span>
}

/** Capability-by-plan comparison table. */
export function V2PlanComparison() {
  return (
    <section
      id="compare"
      className="relative scroll-mt-20 border-y border-[var(--v2-line)] bg-[var(--v2-bg-2)] py-24"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>Compare plans</Eyebrow>
          <h2 className="v2-h mt-4 max-w-2xl text-balance text-3xl leading-tight sm:text-4xl">
            Every limit, side by side.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--v2-muted)]">
            The same limits the product enforces. No per-job, per-retry or per-MCP-call fees on any
            plan.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 overflow-x-auto rounded-xl border border-[var(--v2-line)] bg-[var(--v2-card)]">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--v2-line)]">
                  <th scope="col" className="v2-mono px-5 py-4 text-left text-[var(--v2-faint)]">
                    Capability
                  </th>
                  {CLOUD_PLANS.map((plan) => (
                    <th
                      key={plan.code}
                      scope="col"
                      className={`v2-mono px-4 py-4 text-center ${
                        plan.highlighted ? 'text-[var(--v2-accent)]' : 'text-[var(--v2-fg)]'
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-[var(--v2-line)] transition-colors last:border-b-0 hover:bg-[var(--v2-bg-2)]"
                  >
                    <th
                      scope="row"
                      className="px-5 py-3.5 text-left font-normal text-[var(--v2-muted)]"
                    >
                      {row.label}
                    </th>
                    {CLOUD_PLANS.map((plan) => (
                      <td key={plan.code} className="px-4 py-3.5 text-center text-[var(--v2-fg)]">
                        <MatrixCell value={row.value(plan)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-[var(--v2-muted)]">
            Enterprise is sold by agreement on shared Durabull Cloud. SAML SSO, SCIM, dedicated
            deployment and contractual SLAs are not included in any plan today; ask us about your
            requirements.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/** Billing questions accordion. */
export function V2BillingFaq() {
  return (
    <FaqSection
      id="billing-faq"
      eyebrow="Billing questions"
      title="How billing works"
      items={PRICING_FAQS}
      contactLead="Questions about pricing or Enterprise?"
    />
  )
}

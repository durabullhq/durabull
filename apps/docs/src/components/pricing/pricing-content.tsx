'use client'

import { domAnimation, LazyMotion, m } from 'framer-motion'
import { ArrowRight, CheckCircle2, Heart, Minus, Sparkles, Users } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import { WEB_APP_URL } from '@/lib/config'
import { CLOUD_PLANS, type CloudPlan, effectiveMonthly, PRICING_FAQS } from '@/lib/pricing'

type Interval = 'month' | 'year'

const SALES_EMAIL = 'hello@durabull.io'

function historyLabel(days: number): string {
  return days === 1 ? '24 hours' : `${days} days`
}

function PlanPrice({ plan, interval }: { plan: CloudPlan; interval: Interval }) {
  if (plan.monthlyPriceUsd === null || plan.annualPriceUsd === null) {
    return (
      <div>
        <div className="text-4xl font-bold">Custom</div>
        <div className="text-sm text-muted-foreground">Annual agreement</div>
      </div>
    )
  }
  if (plan.monthlyPriceUsd === 0) {
    return (
      <div>
        <div className="text-4xl font-bold">
          $0<span className="text-base font-normal text-muted-foreground">/month</span>
        </div>
        <div className="text-sm text-muted-foreground">Free forever</div>
      </div>
    )
  }
  if (interval === 'year') {
    return (
      <div>
        <div className="text-4xl font-bold">
          ${effectiveMonthly(plan.annualPriceUsd)}
          <span className="text-base font-normal text-muted-foreground">/month</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Billed ${plan.annualPriceUsd} annually per organization
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="text-4xl font-bold">
        ${plan.monthlyPriceUsd}
        <span className="text-base font-normal text-muted-foreground">/month</span>
      </div>
      <div className="text-sm text-muted-foreground">Per organization, billed monthly</div>
    </div>
  )
}

function planHighlights(plan: CloudPlan): string[] {
  const prefix = plan.code === 'enterprise' ? 'From ' : ''
  return [
    `${prefix}${plan.limits.connections} Redis connection${plan.limits.connections === 1 ? '' : 's'}`,
    `${prefix}${plan.limits.members} member${plan.limits.members === 1 ? '' : 's'}`,
    'All queues on included connections',
    `${prefix}${plan.limits.alertRules} enabled alert rules`,
    `${historyLabel(plan.limits.historyDays)} of Redis health history`,
    plan.features.webhookAlerts ? 'Email, webhook and Linear alerts' : 'Email alerts',
    plan.features.mcpWrites ? 'MCP reads and opt-in writes' : 'Read-only MCP',
    plan.limits.serviceAccounts > 0
      ? `${prefix}${plan.limits.serviceAccounts} service account${plan.limits.serviceAccounts === 1 ? '' : 's'}`
      : 'No service accounts',
    plan.support,
  ]
}

const MATRIX: Array<{ label: string; value: (plan: CloudPlan) => string | boolean }> = [
  {
    label: 'Enabled Redis connections',
    value: (p) =>
      p.code === 'enterprise' ? `From ${p.limits.connections}` : String(p.limits.connections),
  },
  {
    label: 'Members (incl. pending invitations)',
    value: (p) => (p.code === 'enterprise' ? `From ${p.limits.members}` : String(p.limits.members)),
  },
  { label: 'Queues on included connections', value: () => 'All' },
  { label: 'Fees per job, retry or MCP call', value: () => 'None' },
  { label: 'Inspect jobs, logs, queues and workers', value: () => true },
  { label: 'Individual job retry', value: () => true },
  { label: 'Bulk recovery', value: (p) => p.features.bulkRecovery },
  { label: 'Read-only MCP for members', value: () => true },
  { label: 'Opt-in MCP write operations', value: (p) => p.features.mcpWrites },
  {
    label: 'Service accounts',
    value: (p) =>
      p.limits.serviceAccounts === 0
        ? false
        : p.code === 'enterprise'
          ? `From ${p.limits.serviceAccounts}`
          : String(p.limits.serviceAccounts),
  },
  {
    label: 'Enabled alert rules',
    value: (p) =>
      p.code === 'enterprise' ? `From ${p.limits.alertRules}` : String(p.limits.alertRules),
  },
  {
    label: 'Saved alert destinations',
    value: (p) =>
      p.code === 'enterprise' ? `From ${p.limits.destinations}` : String(p.limits.destinations),
  },
  { label: 'Email alerts', value: () => true },
  { label: 'Webhook alerts', value: (p) => p.features.webhookAlerts },
  { label: 'Linear alerts', value: (p) => p.features.linearAlerts },
  { label: 'Redis health history', value: (p) => historyLabel(p.limits.historyDays) },
  { label: 'Support', value: (p) => p.support },
]

function MatrixCell({ value }: { value: string | boolean }) {
  if (value === true)
    return <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-400" aria-label="Included" />
  if (value === false)
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground" aria-label="Not included" />
  return <span>{value}</span>
}

export function PricingContent() {
  const [interval, setInterval] = useState<Interval>('month')
  const posthog = usePostHog()

  useEffect(() => {
    if (posthog && (posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture('pricing_viewed', { page: '/pricing' })
    }
  }, [posthog])

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-screen pt-32 pb-20">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-500/10 rounded-full blur-[120px]" />

        <div className="container mx-auto px-6 relative z-10">
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-300 mb-8">
              <Sparkles className="h-4 w-4" />
              One price per organization
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Simple, predictable
              <br />
              <span className="gradient-text">pricing</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Operate BullMQ across your environments for one team price. Your workers keep running
              on your infrastructure, and there are no per-job fees.
            </p>
          </m.div>

          <div className="flex justify-center mb-10">
            <fieldset className="m-0 inline-flex min-w-0 rounded-full border border-border bg-card/60 p-1">
              <legend className="sr-only">Billing interval</legend>
              {(['month', 'year'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={interval === value}
                  onClick={() => setInterval(value)}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    interval === value ? 'bg-emerald-500 text-emerald-950' : 'text-muted-foreground'
                  }`}
                >
                  {value === 'month' ? 'Monthly' : 'Annual · 2 months free'}
                </button>
              ))}
            </fieldset>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 max-w-7xl mx-auto mb-8">
            {CLOUD_PLANS.map((plan, index) => (
              <m.div
                key={plan.code}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * index }}
                className={`relative flex flex-col rounded-2xl border p-6 bg-card/80 backdrop-blur-sm ${
                  plan.highlighted ? 'border-emerald-500/50' : 'border-border'
                }`}
              >
                {plan.highlighted ? (
                  <div className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold text-emerald-950">
                    Most teams start here
                  </div>
                ) : null}
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 min-h-12 text-sm text-muted-foreground">{plan.description}</p>
                <div className="mt-4 mb-6">
                  <PlanPrice plan={plan} interval={interval} />
                </div>
                <ul className="flex-1 space-y-2.5 text-sm">
                  {planHighlights(plan).map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={
                    plan.cta.href === 'contact'
                      ? `mailto:${SALES_EMAIL}?subject=Durabull%20Enterprise`
                      : `${WEB_APP_URL}/signup`
                  }
                  className={`mt-6 group flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-colors ${
                    plan.highlighted
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950'
                      : 'border border-border hover:border-emerald-500/50'
                  }`}
                >
                  {plan.cta.label}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
              </m.div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mb-20">
            Prices in USD before applicable taxes. Upgrade from Free inside the app; a 14-day
            Business trial needs no card.
          </p>

          <div className="max-w-6xl mx-auto mb-20 overflow-x-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">Compare plans</h2>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 text-left font-medium text-muted-foreground">Capability</th>
                  {CLOUD_PLANS.map((plan) => (
                    <th key={plan.code} className="py-3 text-center font-semibold">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
                    {CLOUD_PLANS.map((plan) => (
                      <td key={plan.code} className="py-3 text-center">
                        <MatrixCell value={row.value(plan)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted-foreground">
              Enterprise is sold by agreement on shared Durabull Cloud. SAML SSO, SCIM, dedicated
              deployment and contractual SLAs are not included in any plan today; ask us about your
              requirements.
            </p>
          </div>

          <div className="max-w-3xl mx-auto mb-20">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Deployment choices</h2>
              <p className="text-muted-foreground">
                Cloud plans cover the hosted service. The desktop app and self-hosting stay free.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Heart,
                  title: 'Durabull Cloud',
                  description:
                    'Hosted and managed. Connect Redis and share operations with your team.',
                },
                {
                  icon: Users,
                  title: 'Desktop App',
                  description:
                    'Install Durabull on Apple Silicon macOS or Windows with a bundled local API. No subscription.',
                },
                {
                  icon: Sparkles,
                  title: 'Self-Hosted',
                  description:
                    'Open source under Apache-2.0. Every local feature, no Cloud subscription, no Stripe.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-6 border border-border bg-card/50 rounded-xl text-center"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-400 mb-4">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">Billing questions</h2>
            <div className="space-y-6">
              {PRICING_FAQS.map((faq) => (
                <div key={faq.question} className="border-b border-border/60 pb-6">
                  <h3 className="font-semibold mb-2">{faq.question}</h3>
                  <p className="text-muted-foreground text-sm">{faq.answer}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-muted-foreground mt-12">
              Questions about pricing or Enterprise?{' '}
              <a href={`mailto:${SALES_EMAIL}`} className="text-emerald-400 hover:underline">
                Reach out
              </a>{' '}
              — we&apos;re happy to chat.
            </p>
          </div>
        </div>
      </div>
    </LazyMotion>
  )
}

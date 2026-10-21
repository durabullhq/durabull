import {
  type BillingInterval,
  CAPACITY_LIMIT_KEYS,
  type CapacityLimitKey,
  effectiveMonthlyUsd,
  FEATURE_LABELS,
  type FeatureKey,
  LIMIT_LABELS,
  type LimitKey,
  PLAN_CODES,
  PLANS,
  type PlanCode,
} from '@durabull/api-client/billing'
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type EnabledBillingOverview,
  useBilling,
  useConfirmCheckout,
  useOpenBillingPortal,
  useRefreshBilling,
  useSaveCapacityAllocation,
  useStartCheckout,
} from '@/hooks/use-billing'
import { cn } from '@/lib/utils'

const SALES_EMAIL = 'hello@durabull.io'

const SOURCE_LABELS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'secondary' }
> = {
  subscription: { label: 'Active', variant: 'success' },
  trial: { label: 'Trial', variant: 'secondary' },
  payment_grace: { label: 'Payment issue', variant: 'warning' },
  pending_upgrade: { label: 'Upgrade pending payment', variant: 'warning' },
  migration_grant: { label: 'Beta transition', variant: 'secondary' },
  override: { label: 'Arranged by Durabull', variant: 'secondary' },
  degraded: { label: 'Unverified', variant: 'warning' },
  free: { label: 'Free', variant: 'secondary' },
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  return DATE_FORMAT.format(new Date(value))
}

function formatLimit(value: number | null, unit: string): string {
  if (value === null) return 'Unlimited'
  return unit ? `${value} ${unit}` : String(value)
}

function formatHistoryDays(days: number | null): string {
  if (days === null) return 'Deployment maximum'
  return days === 1 ? '24 hours' : `${days} days`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type CheckoutReturnState = 'confirming' | 'canceled' | null

/** What the hosted Checkout redirect says about the purchase, read once on mount. */
function readCheckoutReturn(): CheckoutReturnState {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const checkout = params.get('checkout')
  if (checkout === 'canceled') return 'canceled'
  if (checkout === 'success' && params.get('session_id')) return 'confirming'
  return null
}

export function BillingSettingsPage() {
  const { data, isLoading, error } = useBilling()

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4" data-testid="billing-loading">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="p-6 text-sm text-muted-foreground">
          {errorMessage(error, 'Billing information is unavailable right now.')}
        </CardContent>
      </Card>
    )
  }

  if (!data.enabled) return <SelfHostedBilling />
  return <CloudBilling overview={data} />
}

function SelfHostedBilling() {
  return (
    <div className="max-w-4xl space-y-6">
      <Card className="border-muted bg-muted/20">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">Self-hosted deployment</CardTitle>
          <CardDescription>
            This installation runs Durabull under the Apache License 2.0. Every local feature is
            available without a subscription, and nothing here contacts Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Durabull Cloud subscriptions apply only to the hosted service. See{' '}
          <a className="text-primary underline" href="https://durabull.io/pricing">
            durabull.io/pricing
          </a>{' '}
          for Cloud plans and support options.
        </CardContent>
      </Card>
    </div>
  )
}

function CloudBilling({ overview }: { overview: EnabledBillingOverview }) {
  const confirmCheckout = useConfirmCheckout()
  const refreshBilling = useRefreshBilling()
  const [returnState, setReturnState] = useState<CheckoutReturnState>(readCheckoutReturn)
  const handledReturn = useRef(false)

  // The return from hosted Checkout only starts a server-side confirmation;
  // access changes once Stripe state is reconciled.
  useEffect(() => {
    if (handledReturn.current || typeof window === 'undefined') return
    handledReturn.current = true
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const sessionId = params.get('session_id')
    if (checkout === 'success' && sessionId) {
      // mutateAsync settles independently of the observer, so a StrictMode
      // remount cannot leave the page stuck in the confirming state.
      void confirmCheckout
        .mutateAsync(sessionId)
        .catch(() => {})
        .finally(() => setReturnState(null))
    }
    // Plan changes made in the hosted Portal are reconciled on return, so
    // the page does not depend on webhook delivery timing.
    if (params.get('portal') && overview.canManageBilling) {
      void refreshBilling.mutateAsync().catch(() => {})
    }
    if (checkout || params.get('portal')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [confirmCheckout, refreshBilling, overview.canManageBilling])

  const confirming = returnState === 'confirming' || overview.pendingCheckout !== null

  return (
    <div className="max-w-5xl space-y-6" data-testid="billing-settings">
      {confirming ? (
        <Notice tone="info" icon={Loader2} spin title="Confirming your purchase">
          We are waiting for Stripe to confirm payment. Your plan updates here automatically; you
          can leave this page.
        </Notice>
      ) : null}
      {returnState === 'canceled' ? (
        <Notice tone="neutral" icon={CreditCard} title="Checkout canceled">
          Nothing was charged and your plan is unchanged.
        </Notice>
      ) : null}
      <BillingNotices overview={overview} />
      <CurrentPlanCard overview={overview} />
      <UsageCard overview={overview} />
      {overview.allocation ? <AllocationCard overview={overview} /> : null}
      <PlansCard overview={overview} />
    </div>
  )
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
  spin,
}: {
  tone: 'info' | 'warning' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  spin?: boolean
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'flex gap-3 rounded-lg border p-4 text-sm',
        tone === 'warning' && 'border-amber-500/40 bg-amber-500/10',
        tone === 'info' && 'border-primary/30 bg-primary/5',
        tone === 'neutral' && 'border-border bg-muted/30'
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', spin && 'animate-spin')} />
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

function BillingNotices({ overview }: { overview: EnabledBillingOverview }) {
  const notices: React.ReactNode[] = []
  const grace = formatDate(overview.graceExpiresAt)
  if (overview.notices.includes('payment_failed')) {
    notices.push(
      <Notice key="payment" tone="warning" icon={AlertTriangle} title="Payment failed">
        {grace
          ? `Your ${overview.planName} access continues until ${grace}. Update your payment method in Manage billing to keep it.`
          : 'Update your payment method in Manage billing to restore paid features.'}
      </Notice>
    )
  }
  if (overview.notices.includes('payment_pending')) {
    notices.push(
      <Notice key="pending" tone="warning" icon={AlertTriangle} title="Payment pending">
        The latest plan change has not been paid yet. Your previous plan stays active until payment
        is confirmed.
      </Notice>
    )
  }
  if (overview.notices.includes('trial_ending') && overview.subscription?.trialEnd) {
    notices.push(
      <Notice key="trial" tone="info" icon={Sparkles} title="Your trial is ending">
        The Business trial ends on {formatDate(overview.subscription.trialEnd)}. Add a payment
        method in Manage billing to continue; otherwise the organization returns to Free.
      </Notice>
    )
  }
  if (overview.notices.includes('cancellation_scheduled') && overview.subscription) {
    notices.push(
      <Notice key="cancel" tone="neutral" icon={CreditCard} title="Cancellation scheduled">
        {overview.planName} stays active until{' '}
        {formatDate(overview.subscription.cancelAt ?? overview.subscription.currentPeriodEnd)}, then
        the organization moves to Free. Your Redis data and queues are never changed.
      </Notice>
    )
  }
  if (overview.degraded) {
    notices.push(
      <Notice key="degraded" tone="warning" icon={AlertTriangle} title="Billing status unverified">
        We could not confirm this subscription recently. Existing access continues while we recover;
        plan changes may be delayed.
      </Notice>
    )
  }
  if (overview.migrationGrantExpiresAt) {
    const exceeded = overview.freePlanExceeded
    notices.push(
      <Notice key="grant" tone="info" icon={Sparkles} title="Durabull Cloud plans are starting">
        Your current usage stays available until {formatDate(overview.migrationGrantExpiresAt)}.
        Based on today’s usage we suggest the {PLANS[overview.proposedPlanCode as PlanCode].name}{' '}
        plan.
        {exceeded.length > 0
          ? ` On Free, this organization would be above: ${exceeded
              .map(
                (e) => `${LIMIT_LABELS[e.limit].name.toLowerCase()} (${e.usage} of ${e.allowed})`
              )
              .join(', ')}.`
          : ' Your usage fits the Free plan.'}
      </Notice>
    )
  }
  if (overview.capacityAdjustmentExpiresAt) {
    notices.push(
      <Notice key="window" tone="warning" icon={AlertTriangle} title="Above your plan’s limits">
        Existing resources stay enabled until {formatDate(overview.capacityAdjustmentExpiresAt)}.
        Choose what stays enabled below, or upgrade. After that date the newest extra resources are
        paused (never deleted).
      </Notice>
    )
  }
  if (overview.suspended.length > 0) {
    notices.push(
      <Notice key="suspended" tone="warning" icon={AlertTriangle} title="Some resources are paused">
        {overview.suspended.length} resource{overview.suspended.length === 1 ? ' is' : 's are'}{' '}
        paused by your plan’s limits. Nothing was deleted; upgrade or change your selection to
        restore them.
      </Notice>
    )
  }
  if (notices.length === 0) return null
  return <div className="space-y-3">{notices}</div>
}

function CurrentPlanCard({ overview }: { overview: EnabledBillingOverview }) {
  const openPortal = useOpenBillingPortal()
  const refresh = useRefreshBilling()
  const source = SOURCE_LABELS[overview.source] ?? SOURCE_LABELS.free
  // Ended subscriptions stay in history but no longer renew.
  const subscription =
    overview.subscription &&
    !['canceled', 'incomplete_expired'].includes(overview.subscription.status)
      ? overview.subscription
      : null
  const renews = formatDate(subscription?.cancelAt ?? subscription?.currentPeriodEnd)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b bg-muted/30">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {overview.planName} plan
            <Badge variant={source.variant}>{source.label}</Badge>
          </CardTitle>
          <CardDescription>
            {subscription && renews
              ? `${subscription.interval === 'year' ? 'Annual' : 'Monthly'} billing · ${
                  subscription.cancelAtPeriodEnd ? 'ends' : 'renews'
                } ${renews}`
              : 'Billed per organization. Your workers keep running on your infrastructure.'}
          </CardDescription>
        </div>
        {overview.canManageBilling ? (
          <div className="flex flex-wrap gap-2">
            {overview.hasBillingAccount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={openPortal.isPending}
                onClick={() =>
                  openPortal.mutate(undefined, {
                    onError: (error) =>
                      toast.error('Could not open billing', {
                        description: errorMessage(error, ''),
                      }),
                  })
                }
              >
                <CreditCard className="mr-1.5 h-4 w-4" />
                Manage billing
              </Button>
            ) : null}
            {overview.hasBillingAccount ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
                aria-label="Refresh billing status"
              >
                <RefreshCw className={cn('h-4 w-4', refresh.isPending && 'animate-spin')} />
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-4 text-sm text-muted-foreground">
        {overview.canManageBilling
          ? 'Invoices, receipts, payment methods, tax IDs and cancellation are managed securely on Stripe.'
          : 'Only the organization owner can change the plan. Ask your organization owner to upgrade.'}
      </CardContent>
    </Card>
  )
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit === null || limit === 0 ? (used > 0 && limit === 0 ? 1 : 0) : used / limit
  const over = limit !== null && used > limit
  return (
    <div className="space-y-1.5" data-testid="usage-meter">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className={cn('tabular-nums text-muted-foreground', over && 'text-amber-600')}>
          {used} / {limit === null ? '∞' : limit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full bg-primary', ratio >= 1 && 'bg-amber-500')}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  )
}

function UsageCard({ overview }: { overview: EnabledBillingOverview }) {
  const historyDays = overview.limits['history.redis_health_days']
  return (
    <Card>
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Usage</CardTitle>
        <CardDescription>
          No per-job or per-retry fees. All discovered queues on enabled connections are included.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
        {CAPACITY_LIMIT_KEYS.map((key) => (
          <UsageMeter
            key={key}
            label={LIMIT_LABELS[key].name}
            used={overview.usage[key]}
            limit={overview.limits[key]}
          />
        ))}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between">
            <span>{LIMIT_LABELS['history.redis_health_days'].name}</span>
            <span className="text-muted-foreground">{formatHistoryDays(historyDays)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PlansCard({ overview }: { overview: EnabledBillingOverview }) {
  const [interval, setInterval] = useState<BillingInterval>(
    overview.subscription?.interval === 'year' ? 'year' : 'month'
  )
  const startCheckout = useStartCheckout()
  const openPortal = useOpenBillingPortal()
  const hasLiveSubscription =
    overview.subscription !== null &&
    !['canceled', 'incomplete_expired'].includes(overview.subscription.status)
  const currentPlan = overview.planCode

  const handleChoose = (plan: 'team' | 'business', trial = false) => {
    if (hasLiveSubscription) {
      // Existing subscribers change plans in the hosted portal so proration
      // is disclosed by Stripe; a second subscription is never created.
      openPortal.mutate(undefined, {
        onError: (error) =>
          toast.error('Could not open billing', { description: errorMessage(error, '') }),
      })
      return
    }
    startCheckout.mutate(
      { plan, interval, trial },
      {
        onError: (error) =>
          toast.error('Could not start checkout', { description: errorMessage(error, '') }),
      }
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b bg-muted/30">
        <div>
          <CardTitle className="text-base">Plans</CardTitle>
          <CardDescription>
            Prices in USD per organization, before applicable taxes.
          </CardDescription>
        </div>
        <fieldset className="m-0 inline-flex min-w-0 rounded-md border bg-background p-0.5">
          <legend className="sr-only">Billing interval</legend>
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium',
                interval === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {value === 'month' ? 'Monthly' : 'Annual (2 months free)'}
            </button>
          ))}
        </fieldset>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_CODES.map((code) => (
          <PlanColumn
            key={code}
            code={code}
            interval={interval}
            current={currentPlan === code}
            overview={overview}
            busy={startCheckout.isPending || openPortal.isPending}
            onChoose={handleChoose}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function PlanPrice({ code, interval }: { code: PlanCode; interval: BillingInterval }) {
  const plan = PLANS[code]
  if (plan.monthlyPriceUsd === null || plan.annualPriceUsd === null) {
    return <div className="text-2xl font-semibold">Custom</div>
  }
  if (plan.monthlyPriceUsd === 0) {
    return <div className="text-2xl font-semibold">$0</div>
  }
  if (interval === 'year') {
    return (
      <div>
        <div className="text-2xl font-semibold">
          ${effectiveMonthlyUsd(plan.annualPriceUsd).toFixed(2)}
          <span className="text-sm font-normal text-muted-foreground">/month</span>
        </div>
        <div className="text-xs text-muted-foreground">Billed ${plan.annualPriceUsd} annually</div>
      </div>
    )
  }
  return (
    <div className="text-2xl font-semibold">
      ${plan.monthlyPriceUsd}
      <span className="text-sm font-normal text-muted-foreground">/month</span>
    </div>
  )
}

const HIGHLIGHT_LIMITS: LimitKey[] = [
  'connections.enabled',
  'members.reserved',
  'alerts.enabled',
  'service_accounts.enabled',
  'history.redis_health_days',
]

function PlanColumn({
  code,
  interval,
  current,
  overview,
  busy,
  onChoose,
}: {
  code: PlanCode
  interval: BillingInterval
  current: boolean
  overview: EnabledBillingOverview
  busy: boolean
  onChoose: (plan: 'team' | 'business', trial?: boolean) => void
}) {
  const plan = PLANS[code]
  const purchasable = code === 'team' || code === 'business'
  const canBuy = overview.canManageBilling && overview.purchasesEnabled && purchasable && !current

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border p-4',
        current && 'border-primary/60 bg-primary/5'
      )}
      data-testid={`plan-${code}`}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">{plan.name}</div>
        {current ? <Badge variant="success">Current</Badge> : null}
      </div>
      <p className="mt-1 min-h-10 text-xs text-muted-foreground">{plan.description}</p>
      <div className="mt-3">
        <PlanPrice code={code} interval={interval} />
      </div>
      <ul className="mt-4 flex-1 space-y-1.5 text-xs">
        {HIGHLIGHT_LIMITS.map((key) => (
          <li key={key} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{LIMIT_LABELS[key].name}</span>
            <span>
              {key === 'history.redis_health_days'
                ? formatHistoryDays(plan.limits[key])
                : code === 'enterprise'
                  ? `From ${plan.limits[key]}`
                  : formatLimit(plan.limits[key], '')}
            </span>
          </li>
        ))}
        {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((feature) => (
          <li key={feature} className="flex items-center gap-1.5">
            <CheckCircle2
              className={cn(
                'h-3.5 w-3.5',
                plan.features.includes(feature) ? 'text-emerald-500' : 'text-muted-foreground/40'
              )}
            />
            <span
              className={cn(
                !plan.features.includes(feature) && 'text-muted-foreground line-through'
              )}
            >
              {FEATURE_LABELS[feature].name}
            </span>
          </li>
        ))}
        <li className="pt-1 text-muted-foreground">{plan.support}</li>
      </ul>
      <div className="mt-4 space-y-2">
        {code === 'enterprise' ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <a href={`mailto:${SALES_EMAIL}?subject=Durabull%20Enterprise`}>Contact sales</a>
          </Button>
        ) : canBuy ? (
          <>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => onChoose(code as 'team' | 'business')}
            >
              {overview.planCode === 'free' ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
            </Button>
            {code === 'business' && overview.trialEligible ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={busy}
                onClick={() => onChoose('business', true)}
              >
                Start {overview.trialDays}-day free trial
              </Button>
            ) : null}
          </>
        ) : purchasable && !current && !overview.canManageBilling ? (
          <p className="text-xs text-muted-foreground">Ask your organization owner to upgrade.</p>
        ) : null}
      </div>
    </div>
  )
}

const ALLOCATION_KIND_LABELS: Record<string, string> = {
  connection: 'Connection',
  member: 'Member',
  invitation: 'Invitation',
  alert_rule: 'Alert rule',
  alert_destination: 'Destination',
  service_account: 'Service account',
}

function AllocationCard({ overview }: { overview: EnabledBillingOverview }) {
  const [editing, setEditing] = useState<CapacityLimitKey | null>(null)
  const allocation = overview.allocation
  if (!allocation) return null
  const keys = CAPACITY_LIMIT_KEYS.filter((key) => {
    const options = allocation[key]
    const limit = overview.limits[key]
    return options.some((o) => o.suspended) || (limit !== null && options.length > limit)
  })
  if (keys.length === 0) return null

  return (
    <Card>
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Choose what stays enabled</CardTitle>
        <CardDescription>
          Paused resources keep their configuration and can be restored at any time. Pausing never
          changes your Redis data or queues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {keys.map((key) => {
          const options = allocation[key]
          const paused = options.filter((o) => o.suspended).length
          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="text-sm">
                <div className="font-medium">{LIMIT_LABELS[key].name}</div>
                <div className="text-muted-foreground">
                  {options.length - paused} enabled of {overview.limits[key] ?? '∞'} allowed
                  {paused > 0 ? ` · ${paused} paused` : ''}
                </div>
              </div>
              {overview.canManageBilling ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(key)}>
                  Choose
                </Button>
              ) : null}
            </div>
          )
        })}
      </CardContent>
      {editing ? (
        <AllocationDialog
          limitKey={editing}
          options={allocation[editing]}
          limit={overview.limits[editing]}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  )
}

function AllocationDialog({
  limitKey,
  options,
  limit,
  onClose,
}: {
  limitKey: CapacityLimitKey
  options: EnabledBillingOverview['allocation'] extends infer A
    ? A extends Record<CapacityLimitKey, infer O>
      ? O
      : never
    : never
  limit: number | null
  onClose: () => void
}) {
  const save = useSaveCapacityAllocation()
  const [selected, setSelected] = useState<Set<string>>(() => {
    const kept = new Set<string>()
    for (const o of options) if (!o.suspended || o.pinned) kept.add(o.id)
    return kept
  })
  const pinnedCount = useMemo(() => options.filter((o) => o.pinned).length, [options])
  const max = limit === null ? options.length : Math.max(limit, pinnedCount)
  const tooMany = selected.size > max

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{LIMIT_LABELS[limitKey].name}</DialogTitle>
          <DialogDescription>
            Select up to {max} to keep enabled. The rest are paused until you upgrade or change this
            selection.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-auto">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.has(option.id)}
                disabled={option.pinned}
                onChange={(event) => {
                  setSelected((current) => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(option.id)
                    else next.delete(option.id)
                    return next
                  })
                }}
              />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <Badge variant="outline">{ALLOCATION_KIND_LABELS[option.kind] ?? option.kind}</Badge>
              {option.pinned ? <Badge variant="secondary">Owner</Badge> : null}
            </label>
          ))}
        </div>
        <DialogFooter>
          {tooMany ? (
            <span className="mr-auto text-xs text-amber-600">
              {selected.size} selected; your plan allows {max}.
            </span>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={tooMany || save.isPending}
            onClick={() =>
              save.mutate(
                { [limitKey]: [...selected] },
                {
                  onSuccess: () => {
                    toast.success('Selection saved')
                    onClose()
                  },
                  onError: (error) =>
                    toast.error('Could not save selection', {
                      description: errorMessage(error, ''),
                    }),
                }
              )
            }
          >
            Save selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

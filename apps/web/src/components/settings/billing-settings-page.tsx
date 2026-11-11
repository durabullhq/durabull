import {
  type BillingInterval,
  CAPACITY_LIMIT_KEYS,
  type CapacityLimitKey,
  CLOUD_PRICING_URL,
  effectiveMonthlyUsd,
  FEATURE_LABELS,
  type FeatureKey,
  LIMIT_LABELS,
  type LimitKey,
  PLAN_CODES,
  PLANS,
  type PlanCode,
} from '@durabull/api-client/billing'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CreditCard,
  Loader2,
  Minus,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SettingsPage } from '@/components/settings/settings-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader, SectionHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { segmentedItemClass } from '@/components/ui/tabs'
import {
  type EnabledBillingOverview,
  useBilling,
  useCancelCheckout,
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
  { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' }
> = {
  subscription: { label: 'Active', variant: 'success' },
  trial: { label: 'Trial', variant: 'info' },
  payment_grace: { label: 'Payment issue', variant: 'warning' },
  pending_upgrade: { label: 'Upgrade pending payment', variant: 'warning' },
  migration_grant: { label: 'Beta transition', variant: 'neutral' },
  override: { label: 'Arranged by Durabull', variant: 'neutral' },
  degraded: { label: 'Unverified', variant: 'warning' },
  free: { label: 'Free', variant: 'neutral' },
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
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={CreditCard}
        tone="danger"
        title="Billing is unavailable"
        description={errorMessage(error, 'Billing information is unavailable right now.')}
        className="max-w-4xl"
      />
    )
  }

  if (!data.enabled) return <SelfHostedBilling />
  return <CloudBilling overview={data} />
}

function SelfHostedBilling() {
  return (
    <SettingsPage title="Self-hosted deployment" description="No subscription is needed.">
      <Panel>
        <dl className="divide-y text-[13px]">
          <div className="flex gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">License</dt>
            <dd className="min-w-0 flex-1">Apache License 2.0</dd>
          </div>
          <div className="flex gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">Features</dt>
            <dd className="min-w-0 flex-1">Every local feature is available.</dd>
          </div>
          <div className="flex gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">Payments</dt>
            <dd className="min-w-0 flex-1">Nothing here contacts Stripe.</dd>
          </div>
          <div className="flex gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-muted-foreground sm:w-40">Durabull Cloud</dt>
            <dd className="min-w-0 flex-1">
              Subscriptions apply only to the hosted service. Plans and support options are at{' '}
              <a
                className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                href={CLOUD_PRICING_URL}
              >
                {CLOUD_PRICING_URL.replace('https://', '')}
              </a>
              .
            </dd>
          </div>
        </dl>
      </Panel>
    </SettingsPage>
  )
}

function CloudBilling({ overview }: { overview: EnabledBillingOverview }) {
  const confirmCheckout = useConfirmCheckout()
  const cancelCheckout = useCancelCheckout()
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
    // Leaving Checkout without paying closes the attempt on the server.
    if (checkout === 'canceled' && overview.canManageBilling) {
      void cancelCheckout.mutateAsync().catch(() => {})
    }
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
  }, [confirmCheckout, cancelCheckout, refreshBilling, overview.canManageBilling])

  // Only the person returning from Checkout waits for confirmation; the server
  // confirms that session with Stripe directly.
  const confirming = returnState === 'confirming'

  return (
    <PlanSummary overview={overview}>
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
      <UsagePanel overview={overview} />
      {overview.allocation ? <AllocationPanel overview={overview} /> : null}
      <PlansSection overview={overview} />
    </PlanSummary>
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
        'flex gap-3 rounded-lg border px-4 py-3 text-[13px]',
        tone === 'warning' && 'border-status-warning/30 bg-status-warning/10',
        tone === 'info' && 'border-status-active/30 bg-status-active/10',
        tone === 'neutral' && 'bg-muted/40'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'warning' && 'text-status-warning',
          tone === 'info' && 'text-status-active',
          tone === 'neutral' && 'text-muted-foreground',
          spin && 'animate-spin'
        )}
      />
      <div className="space-y-0.5">
        <div className="font-medium">{title}</div>
        <div className="leading-5 text-muted-foreground">{children}</div>
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
          ? `Your ${overview.planName} access continues until ${grace}. ${
              overview.canManageBilling
                ? 'Update your payment method in Manage billing to keep it.'
                : 'Ask your organization owner to update the payment method.'
            }`
          : overview.canManageBilling
            ? 'Update your payment method in Manage billing to restore paid features.'
            : 'Ask your organization owner to update the payment method to restore paid features.'}
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
      <Notice key="trial" tone="info" icon={CalendarClock} title="Your trial is ending">
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
      <Notice
        key="grant"
        tone="info"
        icon={CalendarClock}
        title="Durabull Cloud plans are starting"
      >
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

/** Page heading: which plan, its state, when it renews, and the billing actions. */
function PlanSummary({
  overview,
  children,
}: {
  overview: EnabledBillingOverview
  children: React.ReactNode
}) {
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
  const trialEnds = subscription?.status === 'trialing' ? formatDate(subscription.trialEnd) : null
  const ending = Boolean(subscription?.cancelAtPeriodEnd || subscription?.cancelAt)

  return (
    <SettingsPage
      data-testid="billing-settings"
      title={`${overview.planName} plan`}
      count={
        // "Free plan · Free" says the same thing twice.
        overview.source === 'free' ? undefined : (
          <Badge variant={source.variant} className="font-sans">
            {source.label}
          </Badge>
        )
      }
      description={
        trialEnds
          ? `Free trial · ends ${trialEnds}. Add a payment method in Manage billing to continue after the trial.`
          : subscription && renews
            ? `${subscription.interval === 'year' ? 'Annual' : 'Monthly'} billing · ${
                ending ? 'ends' : 'renews'
              } ${renews}`
            : 'Billed per organization. Your workers keep running on your infrastructure.'
      }
      actions={
        overview.canManageBilling && overview.hasBillingAccount ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
              aria-label="Refresh billing status"
              title="Refresh billing status"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
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
              <CreditCard className="h-3.5 w-3.5" aria-hidden />
              Manage billing
            </Button>
          </>
        ) : undefined
      }
    >
      {children}
    </SettingsPage>
  )
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit === null || limit === 0 ? (used > 0 && limit === 0 ? 1 : 0) : used / limit
  const over = limit !== null && used > limit
  const percent = Math.min(100, Math.round(ratio * 100))
  return (
    <div
      className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(120px,240px)_72px]"
      data-testid="usage-meter"
    >
      <span className="truncate">{label}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot be styled from tokens */}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={used}
        aria-valuetext={limit === null ? `${used}, no limit` : `${used} of ${limit}`}
        className="order-last col-span-2 h-1 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1"
      >
        <div
          className={cn('h-full rounded-full bg-foreground/60', ratio >= 1 && 'bg-status-warning')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          'text-right font-mono tabular-nums text-muted-foreground',
          over && 'text-status-warning'
        )}
      >
        <span className={cn(!over && 'text-foreground')}>{used}</span> /{' '}
        {limit === null ? '∞' : limit}
      </span>
    </div>
  )
}

function UsagePanel({ overview }: { overview: EnabledBillingOverview }) {
  const historyDays = overview.limits['history.redis_health_days']
  return (
    <Panel>
      <PanelHeader>
        <h3 className="text-[13px] font-semibold">Usage</h3>
        <span className="eyebrow">Used / plan limit</span>
      </PanelHeader>
      <div className="divide-y">
        {CAPACITY_LIMIT_KEYS.map((key) => (
          <UsageMeter
            key={key}
            label={LIMIT_LABELS[key].name}
            used={overview.usage[key]}
            limit={overview.limits[key]}
          />
        ))}
        <div className="flex min-h-10 items-center justify-between gap-4 px-4 py-2 text-[13px]">
          <span>{LIMIT_LABELS['history.redis_health_days'].name}</span>
          <span className="font-mono tabular-nums">{formatHistoryDays(historyDays)}</span>
        </div>
      </div>
      <p className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        No per-job or per-retry fees. All discovered queues on enabled connections are included.
      </p>
    </Panel>
  )
}

function PlansSection({ overview }: { overview: EnabledBillingOverview }) {
  const [interval, setInterval] = useState<BillingInterval>(
    overview.subscription?.interval === 'year' ? 'year' : 'month'
  )
  const startCheckout = useStartCheckout()
  const openPortal = useOpenBillingPortal()
  const hasLiveSubscription =
    overview.subscription !== null &&
    !['canceled', 'incomplete_expired'].includes(overview.subscription.status)
  const currentPlan = overview.planCode
  const busy = startCheckout.isPending || openPortal.isPending
  const features = Object.keys(FEATURE_LABELS) as FeatureKey[]

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

  const columnClass = (code: PlanCode) => cn(currentPlan === code && 'bg-muted/50')
  const canBuy = (code: PlanCode) =>
    overview.canManageBilling &&
    overview.purchasesEnabled &&
    (code === 'team' || code === 'business') &&
    currentPlan !== code
  const offersTrial = canBuy('business') && overview.trialEligible

  return (
    <>
      <SectionHeader
        title="Plans"
        description="Prices in USD per organization, before applicable taxes."
        className="pt-2"
        actions={
          <fieldset className="m-0 inline-flex h-8 min-w-0 items-center gap-0.5 rounded-md border bg-muted p-0.5">
            <legend className="sr-only">Billing interval</legend>
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
                className={segmentedItemClass(interval === value, 'px-2.5')}
              >
                {value === 'month' ? 'Monthly' : 'Annual (2 months free)'}
              </button>
            ))}
          </fieldset>
        }
      />
      <Panel>
        <Table className="min-w-[720px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[26%]">
                <span className="sr-only">Compare</span>
              </TableHead>
              {PLAN_CODES.map((code) => (
                <TableHead
                  key={code}
                  className={cn('h-auto py-2.5 align-top', columnClass(code))}
                  data-testid={`plan-${code}`}
                >
                  <span className="flex items-center gap-2 font-sans text-[13px] font-semibold normal-case tracking-normal text-foreground">
                    {PLANS[code].name}
                    {currentPlan === code ? <Badge variant="success">Current</Badge> : null}
                  </span>
                  <span className="mt-1 block font-sans normal-case tracking-normal">
                    <PlanPrice code={code} interval={interval} />
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {HIGHLIGHT_LIMITS.map((key) => (
              <TableRow key={key} className="hover:bg-transparent">
                <TableCell className="text-muted-foreground">{LIMIT_LABELS[key].name}</TableCell>
                {PLAN_CODES.map((code) => (
                  <TableCell key={code} className={cn('font-mono tabular-nums', columnClass(code))}>
                    {key === 'history.redis_health_days'
                      ? formatHistoryDays(PLANS[code].limits[key])
                      : code === 'enterprise'
                        ? `From ${PLANS[code].limits[key]}`
                        : formatLimit(PLANS[code].limits[key], '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {features.map((feature) => (
              <TableRow key={feature} className="hover:bg-transparent">
                <TableCell className="text-muted-foreground">
                  {FEATURE_LABELS[feature].name}
                </TableCell>
                {PLAN_CODES.map((code) => {
                  const included = PLANS[code].features.includes(feature)
                  return (
                    <TableCell key={code} className={columnClass(code)}>
                      {included ? (
                        <Check className="h-4 w-4 text-foreground" aria-hidden />
                      ) : (
                        <Minus className="h-4 w-4 text-faint" aria-hidden />
                      )}
                      <span className="sr-only">{included ? 'Included' : 'Not included'}</span>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
            <TableRow className="hover:bg-transparent">
              <TableCell className="align-top text-muted-foreground">Support</TableCell>
              {PLAN_CODES.map((code) => (
                <TableCell key={code} className={cn('align-top text-xs', columnClass(code))}>
                  {PLANS[code].support}
                </TableCell>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableCell />
              {PLAN_CODES.map((code) => (
                <TableCell key={code} className={cn('py-3 align-top', columnClass(code))}>
                  <div className="flex flex-col items-start gap-1.5">
                    {code === 'enterprise' ? (
                      <Button asChild variant="outline" size="xs">
                        <a href={`mailto:${SALES_EMAIL}?subject=Durabull%20Enterprise`}>
                          Contact sales
                        </a>
                      </Button>
                    ) : canBuy(code) ? (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant={code === 'business' ? 'outline' : 'default'}
                          disabled={busy}
                          onClick={() => handleChoose(code as 'team' | 'business')}
                        >
                          {overview.planCode === 'free'
                            ? `Upgrade to ${PLANS[code].name}`
                            : `Switch to ${PLANS[code].name}`}
                        </Button>
                        {code === 'business' && overview.trialEligible ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={busy}
                            onClick={() => handleChoose('business', true)}
                          >
                            Start {overview.trialDays}-day free trial
                          </Button>
                        ) : null}
                      </>
                    ) : currentPlan === code ? (
                      <span className="text-xs text-muted-foreground">Your plan</span>
                    ) : null}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
        <div className="space-y-1 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          {overview.canManageBilling ? (
            <p>
              Invoices, receipts, payment methods, tax IDs and cancellation are managed securely on
              Stripe.
            </p>
          ) : (
            <>
              <p>Only the organization owner can change the plan.</p>
              <p>Ask your organization owner to upgrade.</p>
            </>
          )}
          {offersTrial ? (
            <p>
              The trial needs no card. Without a payment method the organization returns to Free
              when the trial ends; nothing is charged.
            </p>
          ) : null}
        </div>
      </Panel>
    </>
  )
}

function PlanPrice({ code, interval }: { code: PlanCode; interval: BillingInterval }) {
  const plan = PLANS[code]
  const priceClass = 'font-mono text-sm font-medium tabular-nums text-foreground'
  const unitClass = 'font-sans text-xs font-normal text-muted-foreground'
  if (plan.monthlyPriceUsd === null || plan.annualPriceUsd === null) {
    return <div className={priceClass}>Custom</div>
  }
  if (plan.monthlyPriceUsd === 0) {
    return <div className={priceClass}>$0</div>
  }
  if (interval === 'year') {
    return (
      <div>
        <div className={priceClass}>
          ${effectiveMonthlyUsd(plan.annualPriceUsd).toFixed(2)}
          <span className={unitClass}>/month</span>
        </div>
        <div className="text-xs font-normal text-muted-foreground">
          Billed ${plan.annualPriceUsd} annually
        </div>
      </div>
    )
  }
  return (
    <div className={priceClass}>
      ${plan.monthlyPriceUsd}
      <span className={unitClass}>/month</span>
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

const ALLOCATION_KIND_LABELS: Record<string, string> = {
  connection: 'Connection',
  member: 'Member',
  invitation: 'Invitation',
  alert_rule: 'Alert rule',
  alert_destination: 'Destination',
  service_account: 'Service account',
}

function AllocationPanel({ overview }: { overview: EnabledBillingOverview }) {
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
    <Panel>
      <PanelHeader className="flex-col items-start gap-0.5 py-2.5">
        <h3 className="text-[13px] font-semibold">Choose what stays enabled</h3>
        <p className="text-xs text-muted-foreground">
          Paused resources keep their configuration and can be restored at any time. Pausing never
          changes your Redis data or queues.
        </p>
      </PanelHeader>
      <div className="divide-y">
        {keys.map((key) => {
          const options = allocation[key]
          const paused = options.filter((o) => o.suspended).length
          return (
            <div
              key={key}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-[13px]"
            >
              <span className="min-w-0 flex-1 basis-full truncate sm:basis-0">
                {LIMIT_LABELS[key].name}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {options.length - paused} enabled of {overview.limits[key] ?? '∞'} allowed
                {paused > 0 ? ` · ${paused} paused` : ''}
              </span>
              {overview.canManageBilling ? (
                <Button type="button" variant="outline" size="xs" onClick={() => setEditing(key)}>
                  Choose
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
      {editing ? (
        <AllocationDialog
          limitKey={editing}
          options={allocation[editing]}
          limit={overview.limits[editing]}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Panel>
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
        <div className="max-h-80 divide-y overflow-auto rounded-md border">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-muted/60"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-foreground"
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
              {option.pinned ? <Badge variant="neutral">Owner</Badge> : null}
            </label>
          ))}
        </div>
        <DialogFooter>
          {tooMany ? (
            <span className="mr-auto self-center text-xs text-status-warning">
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

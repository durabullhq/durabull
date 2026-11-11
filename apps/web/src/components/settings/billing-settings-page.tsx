import {
  CAPACITY_LIMIT_KEYS,
  CLOUD_PRICING_URL,
  isPlanCode,
  LIMIT_LABELS,
  PLANS,
} from '@durabull/api-client/billing'
import { useParams } from '@tanstack/react-router'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SettingsPage } from '@/components/settings/settings-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type EnabledBillingOverview,
  type PortalRequest,
  useBilling,
  useCancelCheckout,
  useConfirmCheckout,
  useOpenBillingPortal,
  useRefreshBilling,
} from '@/hooks/use-billing'
import { useActiveOrganization } from '@/hooks/use-organization'
import { cn } from '@/lib/utils'
import { AllocationCard } from './billing/allocation-card'
import {
  type BillingState,
  describeBilling,
  formatBillingDate,
  paymentFixRequest,
} from './billing/billing-state'
import { InvoicesCard } from './billing/invoices-card'
import { Notice } from './billing/notice'
import { PlansCard } from './billing/plans-card'

const SOURCE_LABELS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' }
> = {
  subscription: { label: 'Active', variant: 'success' },
  trial: { label: 'Trial', variant: 'info' },
  payment_grace: { label: 'Payment issue', variant: 'warning' },
  pending_upgrade: { label: 'Upgrade pending payment', variant: 'warning' },
  migration_grant: { label: 'Beta access', variant: 'neutral' },
  override: { label: 'Arranged by Durabull', variant: 'neutral' },
  degraded: { label: 'Unverified', variant: 'warning' },
  free: { label: 'Free', variant: 'neutral' },
}

function formatHistoryDays(days: number | null): string {
  if (days === null) return 'Deployment maximum'
  return days === 1 ? '24 hours' : `${days} days`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * What the return from hosted Checkout means for the person looking at the
 * page. Access only ever changes from reconciled Stripe state; this is the
 * explanation of where that stands.
 */
type CheckoutReturnState = 'confirming' | 'confirmed' | 'unconfirmed' | 'canceled' | null

function readCheckoutReturn(): CheckoutReturnState {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const checkout = params.get('checkout')
  if (checkout === 'canceled') return 'canceled'
  if (checkout === 'success' && params.get('session_id')) return 'confirming'
  return null
}

export function BillingSettingsPage() {
  const { data, isLoading, error, refetch, isFetching } = useBilling()
  const { data: activeOrganization } = useActiveOrganization()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  // Billing follows the active organization, which switches just after
  // navigation. Until it matches this route the data may be another
  // organization's, and a Stripe return must not act on it.
  const settled = !orgSlug || !activeOrganization || activeOrganization.slug === orgSlug

  if (isLoading || !settled) {
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
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        }
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
  const openPortal = useOpenBillingPortal()
  const [returnState, setReturnState] = useState<CheckoutReturnState>(readCheckoutReturn)
  const handledReturn = useRef(false)
  // Kept after the URL is cleaned up, so "Check again" can retry the same session.
  const checkoutSession = useRef<string | null>(null)
  const state = describeBilling(overview)

  // Asks the server to confirm the session with Stripe and says what it means.
  const confirmReturn = useCallback(
    async (sessionId: string): Promise<CheckoutReturnState> => {
      const result = await confirmCheckout.mutateAsync(sessionId).catch(() => null)
      if (result?.status === 'complete') return 'confirmed'
      return result?.status === 'expired' ? 'canceled' : 'unconfirmed'
    },
    [confirmCheckout]
  )

  // The return from hosted Checkout only starts a server-side confirmation;
  // access changes once Stripe state is reconciled.
  useEffect(() => {
    if (handledReturn.current || typeof window === 'undefined') return
    handledReturn.current = true
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const sessionId = params.get('session_id')
    if (checkout === 'success' && sessionId) checkoutSession.current = sessionId
    // What the return turned out to mean, once the server has checked with
    // Stripe. mutateAsync settles independently of the observer, so a
    // StrictMode remount cannot leave the page stuck in the confirming state.
    const settleReturn = async (): Promise<CheckoutReturnState | undefined> => {
      // Leaving Checkout without paying closes the attempt on the server. If
      // the payment went through after all, say so rather than "canceled".
      if (checkout === 'canceled' && overview.canManageBilling) {
        const result = await cancelCheckout.mutateAsync().catch(() => null)
        return result?.status === 'complete' ? 'confirmed' : undefined
      }
      if (checkout === 'success' && sessionId) return confirmReturn(sessionId)
      return undefined
    }
    void settleReturn().then((next) => {
      if (next) setReturnState(next)
    })
    // Plan changes made in the hosted Portal are reconciled on return, so
    // the page does not depend on webhook delivery timing.
    if (params.get('portal') && overview.canManageBilling) {
      void refreshBilling.mutateAsync().catch(() => {})
    }
    if (checkout || params.get('portal')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [confirmReturn, cancelCheckout, refreshBilling, overview.canManageBilling])

  const handlePortal = (request: PortalRequest = { intent: 'manage' }) =>
    openPortal.mutate(request, {
      onError: (error) =>
        toast.error('Could not open billing', { description: errorMessage(error, '') }),
    })
  const handleRefresh = () =>
    refreshBilling.mutate(undefined, {
      onSuccess: () => toast.success('Billing status is up to date'),
      onError: (error) =>
        toast.error('Could not refresh billing', { description: errorMessage(error, '') }),
    })
  // Retry the same checkout session, so the notice changes once Stripe confirms.
  const handleCheckAgain = () => {
    const sessionId = checkoutSession.current
    if (!sessionId) {
      handleRefresh()
      return
    }
    void confirmReturn(sessionId).then(setReturnState)
  }
  const portalBusy = openPortal.isPending
  const showInvoices = overview.canManageBilling && overview.hasBillingAccount

  return (
    <PlanSummary
      overview={overview}
      state={state}
      portalBusy={portalBusy}
      onPortal={handlePortal}
      onRefresh={handleRefresh}
      refreshing={refreshBilling.isPending}
    >
      {returnState === 'confirming' ? (
        <Notice tone="info" icon={Loader2} spin title="Confirming your purchase">
          We are waiting for Stripe to confirm payment. Your plan updates here automatically; you
          can leave this page.
        </Notice>
      ) : null}
      {returnState === 'confirmed' ? (
        <Notice
          tone="success"
          icon={CheckCircle2}
          title="Purchase complete"
          testId="checkout-confirmed"
        >
          Thank you. Your {overview.planName} plan is active
          {showInvoices ? ', and your receipt is listed under Invoices below.' : '.'}
        </Notice>
      ) : null}
      {returnState === 'unconfirmed' ? (
        <Notice
          tone="warning"
          icon={AlertTriangle}
          title="We could not confirm the purchase yet"
          testId="checkout-unconfirmed"
          action={
            overview.canManageBilling ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={refreshBilling.isPending || confirmCheckout.isPending}
                onClick={handleCheckAgain}
              >
                Check again
              </Button>
            ) : null
          }
        >
          If you completed payment, your plan appears here within a minute. You will not be charged
          twice: starting again reuses the same checkout.
        </Notice>
      ) : null}
      {returnState === 'canceled' ? (
        <Notice tone="neutral" icon={CreditCard} title="Checkout canceled">
          Nothing was charged and your plan is unchanged.
        </Notice>
      ) : null}
      <BillingNotices
        overview={overview}
        state={state}
        portalBusy={portalBusy}
        onPortal={handlePortal}
        onRefresh={handleRefresh}
        refreshing={refreshBilling.isPending}
      />
      <UsagePanel overview={overview} />
      {overview.allocation ? <AllocationCard overview={overview} /> : null}
      <PlansCard
        overview={overview}
        state={state}
        portalBusy={portalBusy}
        onPortal={handlePortal}
      />
      {showInvoices ? <InvoicesCard onOpenPortal={() => handlePortal()} /> : null}
    </PlanSummary>
  )
}

interface ActionProps {
  overview: EnabledBillingOverview
  state: BillingState
  portalBusy: boolean
  onPortal: (request?: PortalRequest) => void
  onRefresh: () => void
  refreshing: boolean
}

function BillingNotices({
  overview,
  state,
  portalBusy,
  onPortal,
  onRefresh,
  refreshing,
}: ActionProps) {
  const notices: React.ReactNode[] = []
  const owner = overview.canManageBilling
  const canOpenPortal = owner && overview.hasBillingAccount
  const grace = formatBillingDate(overview.graceExpiresAt)
  const subscribedName = state.subscribedPlan ? PLANS[state.subscribedPlan].name : 'paid'
  const portalButton = (label: string, request: PortalRequest, primary = true) =>
    canOpenPortal ? (
      <Button
        type="button"
        size="sm"
        variant={primary ? 'default' : 'outline'}
        disabled={portalBusy}
        onClick={() => onPortal(request)}
      >
        {label}
      </Button>
    ) : null

  if (state.standing === 'overdue_grace') {
    notices.push(
      <Notice
        key="payment"
        tone="warning"
        icon={AlertTriangle}
        title="Payment failed"
        testId="notice-payment-failed"
        action={portalButton('Update payment method', paymentFixRequest(state))}
      >
        {grace
          ? `Your ${overview.planName} access continues until ${grace}. `
          : `Your ${overview.planName} access continues for now. `}
        {owner
          ? 'Update your payment method to keep it; Stripe retries the charge automatically.'
          : 'Ask your organization owner to update the payment method.'}
      </Notice>
    )
  } else if (state.standing === 'overdue_lapsed') {
    notices.push(
      <Notice
        key="payment"
        tone="warning"
        icon={AlertTriangle}
        title="Payment failed"
        testId="notice-payment-failed"
        action={portalButton('Fix payment', paymentFixRequest(state))}
      >
        Your {subscribedName} subscription has an unpaid invoice, so the organization is on Free
        until it is paid. Nothing was deleted.{' '}
        {owner
          ? 'Pay the invoice or update your payment method to restore paid features.'
          : 'Ask your organization owner to update the payment method.'}
      </Notice>
    )
  } else if (overview.notices.includes('payment_failed')) {
    notices.push(
      <Notice key="payment" tone="warning" icon={AlertTriangle} title="Payment failed">
        {owner
          ? 'Update your payment method in Manage billing to restore paid features.'
          : 'Ask your organization owner to update the payment method to restore paid features.'}
      </Notice>
    )
  }
  if (state.standing === 'incomplete') {
    notices.push(
      <Notice
        key="incomplete"
        tone="warning"
        icon={AlertTriangle}
        title="First payment not completed"
        action={portalButton('Complete payment', paymentFixRequest(state))}
      >
        The {subscribedName} subscription starts once its first payment goes through. If it is not
        completed within a day it expires, nothing is charged and you can start again.
      </Notice>
    )
  } else if (overview.notices.includes('payment_pending')) {
    notices.push(
      overview.source === 'trial' ? (
        <Notice key="pending" tone="info" icon={Info} title="Collecting your first payment">
          Your trial has ended and Stripe is collecting the first payment. Your plan stays active in
          the meantime.
        </Notice>
      ) : (
        <Notice key="pending" tone="warning" icon={AlertTriangle} title="Payment pending">
          The latest plan change has not been paid yet. Your previous plan stays active until
          payment is confirmed.
        </Notice>
      )
    )
  }
  if (state.standing === 'paused') {
    notices.push(
      <Notice
        key="paused"
        tone="warning"
        icon={AlertTriangle}
        title="Subscription paused"
        action={portalButton('Manage billing', { intent: 'manage' })}
      >
        The {subscribedName} subscription is paused, so the organization is on Free until it
        resumes.
      </Notice>
    )
  }
  if (overview.notices.includes('trial_ending') && state.subscription?.trialEnd) {
    notices.push(
      <Notice
        key="trial"
        tone="info"
        icon={CalendarClock}
        title="Your trial is ending"
        action={portalButton('Add payment method', { intent: 'payment_method' })}
      >
        The {subscribedName} trial ends on {formatBillingDate(state.subscription.trialEnd)}. With a
        payment method on file it continues as a paid plan; otherwise the organization returns to
        Free and nothing is charged.
      </Notice>
    )
  }
  if (overview.notices.includes('cancellation_scheduled') && state.subscription) {
    notices.push(
      <Notice
        key="cancel"
        tone="neutral"
        icon={CreditCard}
        title="Cancellation scheduled"
        action={portalButton('Keep my plan', { intent: 'manage' }, false)}
      >
        {overview.planName} stays active until{' '}
        {formatBillingDate(state.subscription.cancelAt ?? state.subscription.currentPeriodEnd)},
        then the organization moves to Free. Your Redis data and queues are never changed.
        {owner ? ' Changed your mind? You can keep the plan until then.' : ''}
      </Notice>
    )
  }
  if (overview.notices.includes('payment_collection_paused')) {
    notices.push(
      <Notice key="collection" tone="neutral" icon={Info} title="Payment collection is paused">
        Durabull has paused charges for this subscription. Your plan stays active.
      </Notice>
    )
  }
  if (overview.notices.includes('unknown_price')) {
    notices.push(
      <Notice key="price" tone="warning" icon={AlertTriangle} title="We are checking your plan">
        Your subscription uses a price we could not match to a plan. Our team has been alerted and
        will correct it; contact support if paid features are missing.
      </Notice>
    )
  }
  if (overview.degraded) {
    notices.push(
      <Notice
        key="degraded"
        tone="warning"
        icon={AlertTriangle}
        title="Billing status unverified"
        action={
          owner ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={refreshing}
              onClick={onRefresh}
            >
              Check again
            </Button>
          ) : null
        }
      >
        We could not confirm this subscription recently. Existing access continues while we recover;
        adding resources is paused until it is confirmed.
      </Notice>
    )
  }
  if (overview.migrationGrantExpiresAt) {
    const until = formatBillingDate(overview.migrationGrantExpiresAt)
    const exceeded = overview.freePlanExceeded
    const chosen = state.standing === 'active' || state.standing === 'trialing'
    const proposed = isPlanCode(overview.proposedPlanCode) ? overview.proposedPlanCode : 'free'
    notices.push(
      chosen ? (
        <Notice
          key="grant"
          tone="info"
          icon={CalendarClock}
          title="You are set for the move to plans"
        >
          Everything you use today stays available until {until}. From then on your {subscribedName}{' '}
          plan’s limits apply.
        </Notice>
      ) : (
        <Notice
          key="grant"
          tone="info"
          icon={CalendarClock}
          title="Durabull Cloud plans are starting"
        >
          Your current usage stays available until {until}. Based on today’s usage we suggest the{' '}
          {PLANS[proposed].name} plan.
          {exceeded.length > 0
            ? ` On Free, this organization would be above: ${exceeded
                .map(
                  (e) => `${LIMIT_LABELS[e.limit].name.toLowerCase()} (${e.usage} of ${e.allowed})`
                )
                .join(', ')}.`
            : ' Your usage fits the Free plan.'}
        </Notice>
      )
    )
  }
  if (!overview.enforced && overview.overLimit.length > 0 && !overview.migrationGrantExpiresAt) {
    notices.push(
      <Notice key="observed" tone="neutral" icon={Info} title="Plan limits are not applied yet">
        Usage above a plan’s limits is shown for reference. Nothing is paused or blocked for this
        organization at the moment.
      </Notice>
    )
  }
  if (overview.capacityAdjustmentExpiresAt) {
    notices.push(
      <Notice key="window" tone="warning" icon={AlertTriangle} title="Above your plan’s limits">
        Existing resources stay enabled until{' '}
        {formatBillingDate(overview.capacityAdjustmentExpiresAt)}.
        {owner ? ' Choose what stays enabled below, or upgrade.' : ''} After that date the newest
        extra resources are paused (never deleted).
      </Notice>
    )
  }
  if (overview.suspended.length > 0) {
    notices.push(
      <Notice key="suspended" tone="warning" icon={AlertTriangle} title="Some resources are paused">
        {overview.suspended.length} resource{overview.suspended.length === 1 ? ' is' : 's are'}{' '}
        paused by your plan’s limits. Nothing was deleted; they come back when you upgrade, free up
        room, or change the selection below.
      </Notice>
    )
  }
  if (notices.length === 0) return null
  return <div className="space-y-3">{notices}</div>
}

function planSummary(overview: EnabledBillingOverview, state: BillingState): string {
  const subscription = state.subscription
  const billing = state.interval === 'year' ? 'Annual billing' : 'Monthly billing'
  const subscribedName = state.subscribedPlan ? PLANS[state.subscribedPlan].name : 'Paid'
  const periodEnd = formatBillingDate(subscription?.cancelAt ?? subscription?.currentPeriodEnd)
  switch (state.standing) {
    case 'trialing':
      return `Free trial · ends ${formatBillingDate(subscription?.trialEnd) ?? 'soon'}. Add a payment method to continue after the trial.`
    case 'active':
      return periodEnd ? `${billing} · renews ${periodEnd}` : billing
    case 'ending':
      return periodEnd ? `${billing} · ends ${periodEnd}` : `${billing} · ending`
    case 'overdue_grace':
      return `${billing} · payment overdue`
    case 'overdue_lapsed':
      return `${subscribedName} subscription on hold · payment overdue`
    case 'incomplete':
      return `${subscribedName} subscription · first payment not completed`
    case 'paused':
      return `${subscribedName} subscription · paused`
    case 'none': {
      const grantEnd = formatBillingDate(overview.migrationGrantExpiresAt)
      if (grantEnd)
        return `Full beta access until ${grantEnd}. Choose a plan below to keep what you use.`
      return 'Billed per organization. Your workers keep running on your infrastructure.'
    }
  }
}

/** Page heading: the plan, its state, when it renews, and the owner's billing actions. */
function PlanSummary({
  overview,
  state,
  portalBusy,
  onPortal,
  onRefresh,
  refreshing,
  children,
}: ActionProps & { children: React.ReactNode }) {
  const overdue = state.standing === 'overdue_lapsed' || state.standing === 'overdue_grace'
  const source = overdue
    ? { label: 'Payment overdue', variant: 'warning' as const }
    : (SOURCE_LABELS[overview.source] ?? SOURCE_LABELS.free)
  const canOpenPortal = overview.canManageBilling && overview.hasBillingAccount

  return (
    <SettingsPage
      data-testid="billing-settings"
      title={`${overview.planName} plan`}
      count={
        // "Free plan · Free" says the same thing twice.
        overview.source === 'free' && !overdue ? undefined : (
          <Badge variant={source.variant} className="font-sans">
            {source.label}
          </Badge>
        )
      }
      description={planSummary(overview, state)}
      actions={
        canOpenPortal ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={refreshing}
              onClick={onRefresh}
              aria-label="Refresh billing status"
              title="Refresh billing status"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={portalBusy}
              onClick={() => onPortal({ intent: 'payment_method' })}
            >
              Payment method
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={portalBusy}
              onClick={() => onPortal({ intent: 'manage' })}
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

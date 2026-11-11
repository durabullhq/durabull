import {
  type BillingInterval,
  effectiveMonthlyUsd,
  FEATURE_LABELS,
  type FeatureKey,
  LIMIT_LABELS,
  type LimitKey,
  PLAN_CODES,
  PLANS,
  type PlanCode,
} from '@durabull/api-client/billing'
import { Check, Minus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, SectionHeader } from '@/components/ui/section'
import { segmentedItemClass } from '@/components/ui/segmented'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type EnabledBillingOverview,
  type PortalRequest,
  useStartCheckout,
} from '@/hooks/use-billing'
import { SALES_EMAIL } from '@/lib/billing'
import { cn } from '@/lib/utils'
import {
  annualMonthsFree,
  type BillingState,
  formatBillingDate,
  type PlanAction,
  paymentFixRequest,
  planAction,
} from './billing-state'

function formatHistoryDays(days: number | null): string {
  if (days === null) return 'Deployment maximum'
  return days === 1 ? '24 hours' : `${days} days`
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : ''
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
  'alerts.destinations',
  'service_accounts.enabled',
  'history.redis_health_days',
]

/** The badge beside a plan's name: what this column is to the organization. */
function columnBadge(
  overview: EnabledBillingOverview,
  state: BillingState,
  code: PlanCode,
  action: PlanAction
): { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' } | null {
  if (state.subscription && state.subscribedPlan === code) {
    if (state.standing === 'overdue_lapsed') return { label: 'Payment overdue', variant: 'warning' }
    if (state.standing === 'incomplete') return { label: 'Payment incomplete', variant: 'warning' }
    if (state.standing === 'paused') return { label: 'Paused', variant: 'warning' }
    if (state.standing === 'trialing') return { label: 'Trial', variant: 'info' }
    if (state.standing === 'ending') return { label: 'Ending', variant: 'neutral' }
    return action.kind === 'current'
      ? { label: 'Current', variant: 'success' }
      : { label: 'Your plan', variant: 'success' }
  }
  if (!state.subscription && overview.planCode === code) {
    if (overview.source === 'override') return { label: 'Arranged by Durabull', variant: 'neutral' }
    if (overview.source === 'free') return { label: 'Current', variant: 'success' }
  }
  return null
}

/** The one next step a plan offers, with the notes that explain it. */
function PlanActions({
  code,
  interval,
  overview,
  state,
  busy,
  onCheckout,
  onPortal,
}: {
  code: PlanCode
  interval: BillingInterval
  overview: EnabledBillingOverview
  state: BillingState
  busy: boolean
  onCheckout: (plan: 'team' | 'business', trial: boolean) => void
  onPortal: (request: PortalRequest) => void
}) {
  const action = planAction(overview, state, code, interval)
  const offerTrial =
    action.kind === 'checkout' && code === 'business' && overview.trialEligible === true
  const endDate = formatBillingDate(
    state.subscription?.cancelAt ?? state.subscription?.currentPeriodEnd
  )
  const grantEnd = formatBillingDate(overview.migrationGrantExpiresAt)
  const note = 'text-xs leading-5 text-muted-foreground'

  return (
    <div className="flex flex-col items-start gap-1.5">
      {action.kind === 'contact_sales' ? (
        <Button asChild variant="outline" size="xs">
          <a href={`mailto:${SALES_EMAIL}?subject=Durabull%20Enterprise`}>Contact sales</a>
        </Button>
      ) : null}
      {action.kind === 'checkout' ? (
        <Button
          type="button"
          size="xs"
          disabled={busy}
          onClick={() => onCheckout(code as 'team' | 'business', false)}
        >
          {action.label}
        </Button>
      ) : null}
      {offerTrial ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => onCheckout('business', true)}
          >
            Start {overview.trialDays}-day free trial
          </Button>
          <p className={note}>
            No card needed. Without a payment method the organization returns to Free when the trial
            ends; nothing is charged.
          </p>
        </>
      ) : null}
      {action.kind === 'change' ? (
        <Button
          type="button"
          size="xs"
          variant={state.subscribedPlan === code ? 'outline' : 'default'}
          disabled={busy}
          onClick={() =>
            onPortal({ intent: 'change_plan', plan: code as 'team' | 'business', interval })
          }
        >
          {action.label}
        </Button>
      ) : null}
      {action.kind === 'fix_payment' ? (
        <Button
          type="button"
          size="xs"
          disabled={busy}
          onClick={() => onPortal(paymentFixRequest(state))}
        >
          {action.label}
        </Button>
      ) : null}
      {action.kind === 'cancel' ? (
        <>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => onPortal({ intent: 'cancel' })}
          >
            {action.label}
          </Button>
          <p className={note}>
            Your paid plan stays active until the end of the period you have paid for.
          </p>
        </>
      ) : null}
      {action.kind === 'current' ? <span className={note}>Your plan</span> : null}
      {action.kind === 'none' && action.note ? <p className={note}>{action.note}</p> : null}
      {code === 'free' && state.standing === 'ending' && endDate ? (
        <p className={note}>Starts {endDate}.</p>
      ) : null}
      {code === 'free' && !state.subscription && grantEnd ? (
        <p className={note}>Applies from {grantEnd} unless a plan is chosen.</p>
      ) : null}
    </div>
  )
}

export function PlansCard({
  overview,
  state,
  portalBusy,
  onPortal,
}: {
  overview: EnabledBillingOverview
  state: BillingState
  /** Shared with the page, so no second portal session starts while one opens. */
  portalBusy: boolean
  onPortal: (request: PortalRequest) => void
}) {
  const [interval, setInterval] = useState<BillingInterval>(state.interval ?? 'month')
  const startCheckout = useStartCheckout()
  const monthsFree = annualMonthsFree('team')
  const owner = overview.canManageBilling
  const busy = startCheckout.isPending || portalBusy
  const features = Object.keys(FEATURE_LABELS) as FeatureKey[]
  const handleCheckout = (plan: 'team' | 'business', trial: boolean) =>
    startCheckout.mutate(
      { plan, interval, trial },
      {
        onError: (error) =>
          toast.error('Could not start checkout', { description: errorMessage(error) }),
      }
    )
  const highlighted = (code: PlanCode) =>
    (state.subscription && state.subscribedPlan === code) ||
    (!state.subscription && overview.planCode === code && overview.source !== 'migration_grant')
  const columnClass = (code: PlanCode) => cn(highlighted(code) && 'bg-muted/50')

  return (
    <div className="space-y-3" data-testid="plans-card">
      <SectionHeader
        title="Plans"
        className="pt-2"
        description={
          state.subscription && !state.selfServe
            ? 'Your plan is set by your agreement with Durabull. Contact us to change it.'
            : owner && !state.subscription && !overview.purchasesEnabled
              ? 'New purchases are paused for the moment. Please check back shortly.'
              : state.subscription && owner
                ? 'Plan changes open Stripe, which shows the prorated amount before you confirm.'
                : 'Prices in USD per organization, before applicable taxes.'
        }
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
                {value === 'month'
                  ? 'Monthly'
                  : monthsFree > 0
                    ? `Annual (${monthsFree} months free)`
                    : 'Annual'}
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
              {PLAN_CODES.map((code) => {
                const badge = columnBadge(
                  overview,
                  state,
                  code,
                  planAction(overview, state, code, interval)
                )
                return (
                  <TableHead
                    key={code}
                    className={cn('h-auto py-2.5 align-top', columnClass(code))}
                    data-testid={`plan-${code}`}
                  >
                    <span className="flex flex-wrap items-center gap-2 font-sans text-[13px] font-semibold normal-case tracking-normal text-foreground">
                      {PLANS[code].name}
                      {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                    </span>
                    <span className="mt-1 block font-sans normal-case tracking-normal">
                      <PlanPrice code={code} interval={interval} />
                    </span>
                  </TableHead>
                )
              })}
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
                        : (PLANS[code].limits[key] ?? 'Unlimited')}
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
                  <PlanActions
                    code={code}
                    interval={interval}
                    overview={overview}
                    state={state}
                    busy={busy}
                    onCheckout={handleCheckout}
                    onPortal={onPortal}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
        <p className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          {owner
            ? 'Invoices, receipts, payment methods, tax IDs and cancellation are managed securely on Stripe.'
            : 'Only the organization owner can change the plan.'}
        </p>
      </Panel>
    </div>
  )
}

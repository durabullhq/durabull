import { Link } from '@tanstack/react-router'
import {
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Mail,
  Plus,
  TestTube2,
  Trash2,
  Webhook,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertStatusBadge, getAlertTypeMeta } from '@/components/alerts/alert-primitives'
import {
  ALERT_RULE_PANEL_IDS,
  type AlertRuleDraft,
  type AlertRuleDraftField,
  type AlertRuleTemplate,
  buildSentenceTokens,
  createAlertRuleDraft,
  createDestinationNotificationRouteDraft,
  createLinearNotificationRouteDraft,
  createNotificationRouteDraft,
  createWebhookNotificationRouteDraft,
  getAlertRuleTemplate,
  type NotificationRouteDraft,
  serializeAlertRuleDraftsForMode,
  validateAlertRuleDraftFields,
} from '@/components/alerts/alert-rule-form'
import { AlertRuleSentence } from '@/components/alerts/alert-rule-sentence'
import { DestinationMultiSelect } from '@/components/alerts/destination-multi-select'
import { QueueMultiSelect } from '@/components/alerts/queue-multi-select'
import { RuleTemplateCards } from '@/components/alerts/rule-template-cards'
import { useAppTopBar } from '@/components/app-top-bar'
import { SecretInput } from '@/components/secret-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  AlertDestinationRecord,
  AlertRuleMutationInput,
  AlertRuleRecord,
  AlertTestResult,
} from '@/hooks/use-alerts'
import { useAlertDestinations, useLinearMetadata, useTestWebhook } from '@/hooks/use-alerts'
import { cn } from '@/lib/utils'

interface AlertRuleBuilderProps {
  mode: 'create' | 'edit'
  orgSlug: string
  connectionId: string
  connectionName?: string | null
  availableQueues: string[]
  /** Existing rule when editing. */
  rule?: AlertRuleRecord | null
  /** Create mode: rule to duplicate (`?from=` search param, resolved by the route). */
  duplicateFrom?: AlertRuleRecord | null
  /** Create mode: template key to preselect (`?template=` search param). */
  initialTemplateKey?: string
  onSave: (inputs: AlertRuleMutationInput[]) => Promise<void>
  onTest?: () => Promise<AlertTestResult>
  isSaving?: boolean
  isTesting?: boolean
  linearIntegrationConfigured?: boolean
}

const ADVANCED_COOLDOWN_DEFAULT = '30'
const ADVANCED_MAX_ISSUES_DEFAULT = '100'

function hasLinearOverrides(route: NotificationRouteDraft): boolean {
  return Boolean(
    route.teamId?.trim() ||
      route.projectId?.trim() ||
      (route.labelIds ?? []).length > 0 ||
      route.assigneeId?.trim() ||
      route.stateId?.trim() ||
      route.priority?.trim()
  )
}

function hasNonDefaultAdvancedValues(draft: AlertRuleDraft): boolean {
  if (draft.cooldownMinutes !== ADVANCED_COOLDOWN_DEFAULT) return true
  if (
    draft.type === 'job_failed' &&
    draft.jobFailedMaxIssuesPerPoll !== ADVANCED_MAX_ISSUES_DEFAULT
  ) {
    return true
  }
  return draft.notificationRoutes.some(
    (route) => route.type === 'linear' && hasLinearOverrides(route)
  )
}

function suggestRuleName(draft: AlertRuleDraft): string {
  const queuePart =
    draft.queueFilterMode === 'exclude'
      ? 'all queues'
      : draft.selectedQueueNames.length === 1
        ? draft.selectedQueueNames[0]
        : draft.selectedQueueNames.length > 1
          ? `${draft.selectedQueueNames.length} queues`
          : 'queues'

  switch (draft.type) {
    case 'failure_threshold':
      return `${queuePart}: ≥${draft.failureThresholdCount || '?'} failures / ${draft.failureThresholdWindowMinutes || '?'}m`
    case 'failure_rate':
      return `${queuePart}: ≥${draft.failureRatePercent || '?'}% failures / ${draft.failureRateWindowMinutes || '?'}m`
    case 'queue_stalled':
      return `${queuePart}: stalled ${draft.stalledMinutes || '?'}m`
    case 'job_failed':
      return `${queuePart}: Linear issue per failed job`
    default:
      return `${queuePart}: alert`
  }
}

export function AlertRuleBuilder({
  mode,
  orgSlug,
  connectionId,
  connectionName,
  availableQueues,
  rule,
  duplicateFrom,
  initialTemplateKey,
  onSave,
  onTest,
  isSaving = false,
  isTesting = false,
  linearIntegrationConfigured = false,
}: AlertRuleBuilderProps) {
  const initialTemplate = mode === 'create' ? getAlertRuleTemplate(initialTemplateKey) : null

  const [draft, setDraft] = useState<AlertRuleDraft>(() => {
    if (mode === 'edit') return createAlertRuleDraft(rule)
    if (duplicateFrom) {
      const copied = createAlertRuleDraft(duplicateFrom)
      // A duplicate should start active even if the original was muted —
      // otherwise the copy silently never fires until the user notices.
      return { ...copied, name: `${copied.name} (copy)`, enabled: true }
    }
    if (initialTemplate) {
      return initialTemplate.apply(createAlertRuleDraft(), {
        linearIntegrationValid: linearIntegrationConfigured,
      })
    }
    return createAlertRuleDraft()
  })
  const [startedFromLabel, setStartedFromLabel] = useState<string | null>(() => {
    if (mode === 'edit') return null
    if (duplicateFrom) return duplicateFrom.name
    if (initialTemplate) return initialTemplate.name
    return null
  })
  const [showTemplatePicker, setShowTemplatePicker] = useState(
    () => mode === 'create' && !duplicateFrom && !initialTemplate
  )
  const [touched, setTouched] = useState<ReadonlySet<AlertRuleDraftField>>(() => new Set())
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [lastTestResult, setLastTestResult] = useState<AlertTestResult | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(() => hasNonDefaultAdvancedValues(draft))

  const destinationsQuery = useAlertDestinations()
  const destinations = destinationsQuery.data?.destinations ?? []
  const linearRoute = draft.notificationRoutes.find((route) => route.type === 'linear') ?? null
  const linearMetadataQuery = useLinearMetadata(Boolean(linearRoute))

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Link
                to="/$orgSlug/c/$connectionId/alerts"
                params={{ orgSlug, connectionId }}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                Alerts
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-semibold text-foreground">
                {mode === 'create' ? 'Create Alert Rule' : 'Edit Alert Rule'}
              </span>
              <span className="hidden truncate text-muted-foreground xl:inline">
                {connectionName ?? 'Connection'} incident policy builder
              </span>
            </div>
          </div>
        </div>
      ),
      actions: (
        <Button asChild size="xs" variant="outline">
          <Link to="/$orgSlug/c/$connectionId/alerts" params={{ orgSlug, connectionId }}>
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Back to alerts
          </Link>
        </Button>
      ),
    }),
    [connectionId, connectionName, mode, orgSlug]
  )

  useAppTopBar(topBarConfig)

  const errors = useMemo(() => validateAlertRuleDraftFields(draft), [draft])
  const sentenceTokens = useMemo(
    () => buildSentenceTokens(draft, destinations),
    [draft, destinations]
  )

  const updateDraft = (next: Partial<AlertRuleDraft>) => {
    setDraft((current) => ({ ...current, ...next }))
    setFormError(null)
  }

  const markTouched = (field: AlertRuleDraftField) => {
    setTouched((current) => {
      if (current.has(field)) return current
      const next = new Set(current)
      next.add(field)
      return next
    })
  }

  const fieldError = (field: AlertRuleDraftField): string | undefined => {
    if (!submitAttempted && !touched.has(field)) return undefined
    return errors[field]
  }

  const applyTemplateChoice = (template: AlertRuleTemplate | null) => {
    const nextDraft = template
      ? template.apply(createAlertRuleDraft(), {
          linearIntegrationValid: linearIntegrationConfigured,
        })
      : createAlertRuleDraft()
    setDraft(nextDraft)
    setStartedFromLabel(template ? template.name : 'Scratch')
    setShowTemplatePicker(false)
    setTouched(new Set())
    setSubmitAttempted(false)
    setFormError(null)
    setAdvancedOpen(hasNonDefaultAdvancedValues(nextDraft))
  }

  async function handleSubmit() {
    setSubmitAttempted(true)

    if (Object.keys(errors).length > 0) {
      setFormError('Fix the highlighted fields before saving.')
      requestAnimationFrame(() => {
        const firstError = document.querySelector('[data-field-error]')
        firstError?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    setFormError(null)
    try {
      await onSave(serializeAlertRuleDraftsForMode(draft, mode))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save the alert rule.')
    }
  }

  async function handleTest() {
    if (!onTest) return

    try {
      const result = await onTest()
      setLastTestResult(result)
      toast.success(
        result.evaluation.triggered ? 'Rule would fire right now' : 'Rule would stay quiet',
        {
          description:
            result.evaluation.summary || 'The live queue snapshot did not trigger this rule.',
        }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to run a live test.'
      setFormError(message)
      toast.error('Live test failed', { description: message })
    }
  }

  return (
    <div className="min-w-0">
      <div className="z-10 -mt-2 border-b border-border/70 bg-background/95 py-4 backdrop-blur md:sticky md:top-0">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
          <AlertRuleSentence
            tokens={sentenceTokens}
            onTokenClick={(token) => {
              if (token.key === 'cooldown') setAdvancedOpen(true)
            }}
          />
          <div className="flex shrink-0 items-center gap-2">
            {mode === 'edit' && rule ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link
                  to="/$orgSlug/c/$connectionId/alerts/new"
                  params={{ orgSlug, connectionId }}
                  search={{ from: rule.id }}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  Duplicate
                </Link>
              </Button>
            ) : null}
            {mode === 'edit' && onTest ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={isTesting}
              >
                <TestTube2 className="mr-1.5 h-4 w-4" />
                {isTesting ? 'Running live test...' : 'Run live test'}
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving...' : mode === 'create' ? 'Create rule' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 w-full max-w-3xl space-y-6 pb-16">
        {formError ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            data-testid="alert-rule-form-error"
          >
            {formError}
          </div>
        ) : null}

        {lastTestResult ? <LiveTestResultPanel result={lastTestResult} /> : null}

        {mode === 'create' ? (
          showTemplatePicker ? (
            <BuilderPanel
              id={ALERT_RULE_PANEL_IDS.template}
              title="Start from a template"
              description="Templates preload a sensible condition, scope, and cooldown — everything stays editable."
            >
              <RuleTemplateCards
                linearIntegrationValid={linearIntegrationConfigured}
                onSelectTemplate={(template) => applyTemplateChoice(template)}
                onStartFromScratch={() => applyTemplateChoice(null)}
              />
            </BuilderPanel>
          ) : (
            <div
              id={ALERT_RULE_PANEL_IDS.template}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/10 px-4 py-3 text-sm"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                Started from:{' '}
                <span className="font-medium text-foreground">{startedFromLabel ?? 'Scratch'}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowTemplatePicker(true)}
              >
                Change
              </Button>
            </div>
          )
        ) : null}

        <BuilderPanel
          id={ALERT_RULE_PANEL_IDS.condition}
          title="Condition"
          description="Choose the failure model and tune when normal noise becomes an incident."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(['failure_threshold', 'failure_rate', 'queue_stalled', 'job_failed'] as const).map(
              (type) => {
                const meta = getAlertTypeMeta(type)
                const isActive = draft.type === type

                return (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      'rounded-md border px-4 py-3 text-left transition-colors',
                      isActive
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border/70 bg-background hover:border-foreground/40'
                    )}
                    onClick={() => updateDraft({ type })}
                    data-testid={`alert-rule-type-${type}`}
                  >
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <p
                      className={cn(
                        'mt-1.5 text-sm leading-6',
                        isActive ? 'text-background/80' : 'text-muted-foreground'
                      )}
                    >
                      {meta.description}
                    </p>
                  </button>
                )
              }
            )}
          </div>

          <div className="mt-5">
            {draft.type === 'failure_threshold' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="alert-threshold-count"
                  label="New failures"
                  unit="failures"
                  value={draft.failureThresholdCount}
                  error={fieldError('failureThresholdCount')}
                  onChange={(value) => updateDraft({ failureThresholdCount: value })}
                  onBlur={() => markTouched('failureThresholdCount')}
                  helper="Minimum newly failed jobs before the rule fires."
                />
                <NumberField
                  id="alert-threshold-window"
                  label="Window"
                  unit="min"
                  value={draft.failureThresholdWindowMinutes}
                  error={fieldError('failureThresholdWindowMinutes')}
                  onChange={(value) => updateDraft({ failureThresholdWindowMinutes: value })}
                  onBlur={() => markTouched('failureThresholdWindowMinutes')}
                  helper="How far back to look when measuring the spike."
                />
              </div>
            ) : null}

            {draft.type === 'failure_rate' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberField
                  id="alert-rate-percent"
                  label="Failure rate"
                  unit="%"
                  value={draft.failureRatePercent}
                  error={fieldError('failureRatePercent')}
                  onChange={(value) => updateDraft({ failureRatePercent: value })}
                  onBlur={() => markTouched('failureRatePercent')}
                  helper="Maximum acceptable error ratio in the window."
                />
                <NumberField
                  id="alert-rate-window"
                  label="Window"
                  unit="min"
                  value={draft.failureRateWindowMinutes}
                  error={fieldError('failureRateWindowMinutes')}
                  onChange={(value) => updateDraft({ failureRateWindowMinutes: value })}
                  onBlur={() => markTouched('failureRateWindowMinutes')}
                  helper="Rolling window for the rate calculation."
                />
                <NumberField
                  id="alert-rate-min-sample"
                  label="Minimum sample"
                  unit="jobs"
                  value={draft.failureRateMinSample}
                  error={fieldError('failureRateMinSample')}
                  onChange={(value) => updateDraft({ failureRateMinSample: value })}
                  onBlur={() => markTouched('failureRateMinSample')}
                  helper="Ignore tiny volumes until enough jobs finish."
                />
              </div>
            ) : null}

            {draft.type === 'queue_stalled' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="alert-stalled-window"
                  label="Stalled after"
                  unit="min"
                  value={draft.stalledMinutes}
                  error={fieldError('stalledMinutes')}
                  onChange={(value) => updateDraft({ stalledMinutes: value })}
                  onBlur={() => markTouched('stalledMinutes')}
                  helper="How long jobs can wait without completions."
                />
              </div>
            ) : null}

            {draft.type === 'job_failed' ? (
              <p className="rounded-md border border-border/70 bg-muted/10 px-4 py-3 text-sm leading-6 text-muted-foreground">
                Every failed job opens exactly one deduplicated Linear issue. Tune the per-poll
                issue cap under Advanced.
              </p>
            ) : null}
          </div>
        </BuilderPanel>

        <BuilderPanel
          id={ALERT_RULE_PANEL_IDS.queues}
          title="Queue scope"
          description="Target every discovered queue on the connection or a searchable subset."
        >
          <div className="space-y-4" {...(fieldError('queues') ? { 'data-field-error': '' } : {})}>
            <QueueMultiSelect
              availableQueues={availableQueues}
              selectedQueueNames={draft.selectedQueueNames}
              onSelectedQueueNamesChange={(selectedQueueNames) => {
                markTouched('queues')
                updateDraft({ selectedQueueNames })
              }}
              queueFilterMode={draft.queueFilterMode}
              onQueueFilterModeChange={(queueFilterMode) =>
                updateDraft({ queueFilterMode, selectedQueueNames: [] })
              }
            />
            {fieldError('queues') ? (
              <p className="text-sm text-destructive">{fieldError('queues')}</p>
            ) : null}
          </div>
        </BuilderPanel>

        <BuilderPanel
          id={ALERT_RULE_PANEL_IDS.notify}
          title="Notify"
          description="Route incidents to saved destinations, or add one-off email and webhook routes. Linear uses the organization defaults unless this rule overrides them under Advanced."
        >
          <NotifyPanelBody
            draft={draft}
            ruleId={rule?.id}
            connectionId={connectionId}
            destinations={destinations}
            destinationsLoading={destinationsQuery.isLoading}
            linearIntegrationConfigured={linearIntegrationConfigured}
            fieldError={fieldError}
            markTouched={markTouched}
            updateDraft={updateDraft}
          />
        </BuilderPanel>

        <BuilderPanel
          id={ALERT_RULE_PANEL_IDS.name}
          title="Name & status"
          description="Name the policy so responders understand the intent at a glance."
        >
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2" {...(fieldError('name') ? { 'data-field-error': '' } : {})}>
              <Label htmlFor="alert-rule-name">Rule name</Label>
              <Input
                id="alert-rule-name"
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                onBlur={() => markTouched('name')}
                placeholder={suggestRuleName(draft)}
                aria-invalid={fieldError('name') ? true : undefined}
                className={cn(
                  fieldError('name') &&
                    'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40'
                )}
                data-testid="alert-rule-name-input"
              />
              {fieldError('name') ? (
                <p className="text-sm text-destructive">{fieldError('name')}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="inline-flex rounded-md border border-border/70 bg-background">
                <button
                  type="button"
                  className={cn(
                    'px-4 py-2 text-sm transition-colors',
                    draft.enabled
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => updateDraft({ enabled: true })}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  className={cn(
                    'border-l border-border/70 px-4 py-2 text-sm transition-colors',
                    !draft.enabled
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => updateDraft({ enabled: false })}
                >
                  Muted
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Muted rules are saved but won&apos;t emit incidents until enabled.
              </p>
            </div>
          </div>
        </BuilderPanel>

        <section
          id={ALERT_RULE_PANEL_IDS.advanced}
          tabIndex={-1}
          className="rounded-lg border border-border/70 bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
              data-testid="alert-rule-advanced-trigger"
            >
              <div>
                <h3 className="text-base font-semibold">Advanced</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Cooldown, Linear overrides, and per-poll limits.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  advancedOpen && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-6 border-t border-border/70 px-6 py-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    id="alert-cooldown-minutes"
                    label="Cooldown"
                    unit="min"
                    value={draft.cooldownMinutes}
                    error={fieldError('cooldownMinutes')}
                    onChange={(value) => updateDraft({ cooldownMinutes: value })}
                    onBlur={() => markTouched('cooldownMinutes')}
                    helper="Repeat incidents are suppressed during this window."
                  />
                  {draft.type === 'job_failed' ? (
                    <NumberField
                      id="alert-job-failed-max-issues"
                      label="Max issues per poll"
                      unit="issues"
                      value={draft.jobFailedMaxIssuesPerPoll}
                      error={fieldError('jobFailedMaxIssuesPerPoll')}
                      onChange={(value) => updateDraft({ jobFailedMaxIssuesPerPoll: value })}
                      onBlur={() => markTouched('jobFailedMaxIssuesPerPoll')}
                      helper="Caps how many failed jobs become Linear issues per monitor tick."
                    />
                  ) : null}
                </div>

                {linearRoute ? (
                  <LinearOverrideFields
                    route={linearRoute}
                    metadataQuery={linearMetadataQuery}
                    onUpdate={(nextRoute) => {
                      const notificationRoutes = draft.notificationRoutes.map((current) =>
                        current.id === nextRoute.id ? nextRoute : current
                      )
                      updateDraft({ notificationRoutes })
                    }}
                  />
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>
      </div>
    </div>
  )
}

function BuilderPanel({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      className="rounded-lg border border-border/70 bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <div className="border-b border-border/70 px-6 py-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

function NumberField({
  id,
  label,
  value,
  unit,
  error,
  helper,
  onChange,
  onBlur,
}: {
  id: string
  label: string
  value: string
  unit?: string
  error?: string
  helper?: string
  onChange: (value: string) => void
  onBlur?: () => void
}) {
  return (
    <div className="space-y-2" {...(error ? { 'data-field-error': '' } : {})}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          className={cn(
            'text-right font-mono tabular-nums',
            unit && 'pr-20',
            error &&
              'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40'
          )}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : helper ? (
        <p className="text-sm text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  )
}

function routeDestinationId(route: NotificationRouteDraft): string {
  return (route.destinationId ?? route.target).trim()
}

function NotifyPanelBody({
  draft,
  ruleId,
  connectionId,
  destinations,
  destinationsLoading,
  linearIntegrationConfigured,
  fieldError,
  markTouched,
  updateDraft,
}: {
  draft: AlertRuleDraft
  ruleId?: string
  connectionId: string
  destinations: AlertDestinationRecord[]
  destinationsLoading: boolean
  linearIntegrationConfigured: boolean
  fieldError: (field: AlertRuleDraftField) => string | undefined
  markTouched: (field: AlertRuleDraftField) => void
  updateDraft: (next: Partial<AlertRuleDraft>) => void
}) {
  const activeLinearRoutes = draft.notificationRoutes.filter((route) => route.type === 'linear')
  const routeLimitReached = draft.notificationRoutes.length >= 10

  const destinationRoutes = draft.notificationRoutes.filter((route) => route.type === 'destination')
  const oneOffRoutes = draft.notificationRoutes.filter((route) => route.type !== 'destination')
  const selectedDestinationIds = destinationRoutes.map(routeDestinationId).filter(Boolean)

  const setSelectedDestinationIds = (destinationIds: string[]) => {
    const nextDestinationRoutes = destinationIds.map(
      (destinationId) =>
        destinationRoutes.find((route) => routeDestinationId(route) === destinationId) ??
        createDestinationNotificationRouteDraft(0, destinationId)
    )
    updateDraft({ notificationRoutes: [...nextDestinationRoutes, ...oneOffRoutes] })
  }

  const replaceRoute = (routeId: string, nextRoute: NotificationRouteDraft) => {
    const notificationRoutes = draft.notificationRoutes.map((current) =>
      current.id === routeId ? nextRoute : current
    )
    updateDraft({ notificationRoutes })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Saved destinations</Label>
        <DestinationMultiSelect
          destinations={destinations}
          selectedDestinationIds={selectedDestinationIds}
          onSelectedDestinationIdsChange={setSelectedDestinationIds}
          isLoading={destinationsLoading}
        />
        <p className="text-sm text-muted-foreground">
          Managed under Settings → Alert destinations; edits there apply to every rule that routes
          to them.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium text-muted-foreground">or add one-off routes</div>
        {oneOffRoutes.map((route, index) => {
          const error = fieldError(`route:${route.id}`)

          return (
            <div
              key={route.id}
              className="rounded-md border border-border/70 bg-muted/5 px-4 py-3"
              {...(error ? { 'data-field-error': '' } : {})}
            >
              <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-start gap-3">
                <NotificationRouteFields
                  route={route}
                  index={index}
                  ruleId={ruleId}
                  connectionId={connectionId}
                  destinations={destinations}
                  error={error}
                  onBlur={() => markTouched(`route:${route.id}`)}
                  onUpdate={(nextRoute) => replaceRoute(route.id, nextRoute)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const notificationRoutes = draft.notificationRoutes.filter(
                      (current) => current.id !== route.id
                    )
                    updateDraft({
                      notificationRoutes:
                        notificationRoutes.length > 0
                          ? notificationRoutes
                          : [createNotificationRouteDraft()],
                    })
                  }}
                  aria-label={`Remove ${route.type} route ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (routeLimitReached) return
            updateDraft({
              notificationRoutes: [...draft.notificationRoutes, createNotificationRouteDraft()],
            })
          }}
          disabled={routeLimitReached}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Email
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (routeLimitReached || activeLinearRoutes.length >= 1) return
            updateDraft({
              notificationRoutes: [
                ...draft.notificationRoutes,
                createLinearNotificationRouteDraft(),
              ],
            })
          }}
          disabled={
            !linearIntegrationConfigured || routeLimitReached || activeLinearRoutes.length >= 1
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Linear
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (routeLimitReached) return
            updateDraft({
              notificationRoutes: [
                ...draft.notificationRoutes,
                createWebhookNotificationRouteDraft(),
              ],
            })
          }}
          disabled={routeLimitReached}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Webhook
        </Button>
        <span className="text-sm text-muted-foreground">
          Up to 10 routes total, one Linear route per rule.
        </span>
      </div>
    </div>
  )
}

function NotificationRouteFields({
  route,
  index,
  ruleId,
  connectionId,
  destinations,
  error,
  onBlur,
  onUpdate,
}: {
  route: NotificationRouteDraft
  index: number
  ruleId?: string
  connectionId: string
  destinations: AlertDestinationRecord[]
  error?: string
  onBlur: () => void
  onUpdate: (nextRoute: NotificationRouteDraft) => void
}) {
  const testWebhookMutation = useTestWebhook(connectionId)
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null)

  async function handleTestWebhook() {
    const url = route.webhookUrl?.trim() ?? route.target.trim()
    if (!url) {
      toast.error('Webhook URL is required before testing.')
      return
    }

    setTestingRouteId(route.id)
    try {
      const result = await testWebhookMutation.mutateAsync({
        url,
        secret: route.webhookSecret?.trim() || undefined,
        ruleId,
      })
      if (result.success) {
        toast.success('Test webhook delivered', {
          description: `HTTP ${result.httpStatus ?? 'unknown'} in ${result.durationMs}ms`,
        })
      } else {
        toast.error('Test webhook failed', {
          description: result.error ?? `HTTP ${result.httpStatus ?? 'unknown'}`,
        })
      }
    } catch (testError) {
      toast.error('Test webhook failed', {
        description:
          testError instanceof Error ? testError.message : 'Unable to send test webhook.',
      })
    } finally {
      setTestingRouteId(null)
    }
  }

  if (route.type === 'email') {
    return (
      <>
        <div className="inline-flex items-center gap-2 pt-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email
        </div>
        <Input
          value={route.target}
          onChange={(event) => onUpdate({ ...route, target: event.target.value })}
          onBlur={onBlur}
          placeholder="oncall@example.com"
          aria-invalid={error ? true : undefined}
          className={cn(
            error &&
              'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40'
          )}
          data-testid={`alert-rule-email-${index}`}
        />
      </>
    )
  }

  if (route.type === 'webhook' && route.webhookMode === 'saved') {
    // Legacy saved-webhook channel: still supported on existing rules, but new
    // routes to saved destinations go through the destination multi-select.
    const destinationId = route.webhookDestinationId?.trim() ?? route.target.trim()
    const destination = destinations.find((candidate) => candidate.id === destinationId)

    return (
      <>
        <div className="inline-flex items-center gap-2 pt-2 text-sm font-medium">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          Webhook
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline" className="gap-1.5 border-border/70 bg-background">
            <Webhook className="h-3 w-3 text-muted-foreground" />
            {destination?.name ?? 'Saved webhook destination'}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Legacy saved webhook — kept as-is when you save this rule.
          </span>
        </div>
      </>
    )
  }

  if (route.type === 'webhook') {
    return (
      <>
        <div className="inline-flex items-center gap-2 pt-2 text-sm font-medium">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          Webhook
        </div>
        <div className="grid gap-2">
          <Input
            aria-label={`Webhook URL ${index + 1}`}
            value={route.webhookUrl ?? route.target}
            onChange={(event) =>
              onUpdate({
                ...route,
                target: event.target.value,
                webhookUrl: event.target.value,
              })
            }
            onBlur={onBlur}
            placeholder="https://example.com/webhooks/durabull"
            aria-invalid={error ? true : undefined}
            className={cn(
              error &&
                'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40'
            )}
            data-testid={`alert-rule-webhook-url-${index}`}
          />
          <SecretInput
            aria-label={`Webhook signing secret ${index + 1}`}
            value={route.webhookSecret ?? ''}
            onChange={(event) => onUpdate({ ...route, webhookSecret: event.target.value })}
            onBlur={onBlur}
            placeholder={
              route.secretConfigured
                ? `Optional — leave blank to keep existing (…${route.secretLast4 ?? ''})`
                : 'Optional signing secret (min 16 characters)'
            }
            data-testid={`alert-rule-webhook-secret-${index}`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => void handleTestWebhook()}
            disabled={testingRouteId === route.id || testWebhookMutation.isPending}
          >
            {testingRouteId === route.id ? 'Sending test...' : 'Send test webhook'}
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="inline-flex items-center gap-2 pt-2 text-sm font-medium">Linear</div>
      <p className="pt-2 text-sm leading-6 text-muted-foreground">
        Creates issues through your organization&apos;s Linear integration defaults. Per-rule
        overrides live under Advanced.
      </p>
    </>
  )
}

const LINEAR_PRIORITY_OPTIONS = [
  { value: '', label: 'Org default' },
  { value: '0', label: '0 — None' },
  { value: '1', label: '1 — Urgent' },
  { value: '2', label: '2 — High' },
  { value: '3', label: '3 — Medium' },
  { value: '4', label: '4 — Low' },
]

function LinearOverrideFields({
  route,
  metadataQuery,
  onUpdate,
}: {
  route: NotificationRouteDraft
  metadataQuery: ReturnType<typeof useLinearMetadata>
  onUpdate: (nextRoute: NotificationRouteDraft) => void
}) {
  const metadata = metadataQuery.data
  const labelIds = route.labelIds ?? []

  if (metadataQuery.isLoading) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Linear overrides</h4>
        <p className="text-sm text-muted-foreground">Loading Linear metadata...</p>
      </div>
    )
  }

  if (!metadata) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Linear overrides</h4>
        <p className="text-sm text-muted-foreground">
          Linear metadata is unavailable right now. This rule keeps using the organization defaults.
        </p>
      </div>
    )
  }

  const states = route.teamId
    ? metadata.states.filter((state) => state.teamId === route.teamId)
    : metadata.states
  const selectedLabels = metadata.labels.filter((label) => labelIds.includes(label.id))

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Linear overrides</h4>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Only for this rule — blank fields fall back to the organization integration defaults.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="linear-override-team">Team</Label>
          <Select
            id="linear-override-team"
            value={route.teamId ?? ''}
            onChange={(event) => onUpdate({ ...route, teamId: event.target.value, stateId: '' })}
          >
            <option value="">Org default</option>
            {metadata.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.key})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-override-project">Project</Label>
          <Select
            id="linear-override-project"
            value={route.projectId ?? ''}
            onChange={(event) => onUpdate({ ...route, projectId: event.target.value })}
          >
            <option value="">Org default</option>
            {metadata.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-override-assignee">Assignee</Label>
          <Select
            id="linear-override-assignee"
            value={route.assigneeId ?? ''}
            onChange={(event) => onUpdate({ ...route, assigneeId: event.target.value })}
          >
            <option value="">Org default</option>
            {metadata.users.map((linearUser) => (
              <option key={linearUser.id} value={linearUser.id}>
                {linearUser.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-override-state">State</Label>
          <Select
            id="linear-override-state"
            value={route.stateId ?? ''}
            onChange={(event) => onUpdate({ ...route, stateId: event.target.value })}
          >
            <option value="">Org default</option>
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-override-priority">Priority</Label>
          <Select
            id="linear-override-priority"
            value={route.priority ?? ''}
            onChange={(event) => onUpdate({ ...route, priority: event.target.value })}
          >
            {LINEAR_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linear-override-labels">Labels</Label>
          <Select
            id="linear-override-labels"
            value=""
            onChange={(event) => {
              const labelId = event.target.value
              if (!labelId || labelIds.includes(labelId)) return
              onUpdate({ ...route, labelIds: [...labelIds, labelId] })
            }}
          >
            <option value="">Add a label…</option>
            {metadata.labels
              .filter((label) => !labelIds.includes(label.id))
              .map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
          </Select>
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedLabels.map((label) => (
                <Badge key={label.id} variant="outline" className="gap-1 border-border/70">
                  {label.name}
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() =>
                      onUpdate({
                        ...route,
                        labelIds: labelIds.filter((id) => id !== label.id),
                      })
                    }
                    aria-label={`Remove label ${label.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function LiveTestResultPanel({ result }: { result: AlertTestResult }) {
  return (
    <section className="rounded-lg border border-border/70 bg-background px-6 py-5">
      <h3 className="text-sm font-semibold">Latest live test</h3>
      <div className="mt-3 space-y-3 text-sm">
        <AlertStatusBadge
          status={result.evaluation.triggered ? 'firing' : 'resolved'}
          emphasize={result.evaluation.triggered}
        />
        <p className="leading-6 text-muted-foreground">
          {result.evaluation.summary || 'The live queue snapshot did not trigger this rule.'}
        </p>
        {result.webhookTests && result.webhookTests.length > 0 ? (
          <div className="space-y-2">
            <div className="font-medium text-foreground">Webhook delivery tests</div>
            <div className="space-y-2">
              {result.webhookTests.map((test) => (
                <div
                  key={test.url}
                  className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono">{test.url}</span>
                    <Badge variant={test.success ? 'success' : 'destructive'}>
                      {test.success ? 'Sent' : 'Failed'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    HTTP {test.httpStatus ?? 'n/a'} in {test.durationMs}ms
                    {test.error ? ` - ${test.error}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** Loading placeholder matching the builder layout: sentence bar + panel blocks. */
export function AlertRuleBuilderSkeleton() {
  return (
    <div className="min-w-0">
      <div className="-mt-2 border-b border-border/70 py-4">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-7 w-full max-w-md" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="mx-auto mt-6 w-full max-w-3xl space-y-6 pb-16">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-44 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

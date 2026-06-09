import { Link } from '@tanstack/react-router'
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  TestTube2,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertStatusBadge,
  AlertTypeBadge,
  getAlertTypeMeta,
} from '@/components/alerts/alert-primitives'
import {
  type AlertRuleDraft,
  createAlertRuleDraft,
  createLinearNotificationRouteDraft,
  createNotificationRouteDraft,
  createSavedWebhookNotificationRouteDraft,
  createWebhookNotificationRouteDraft,
  normalizeNotificationEmails,
  serializeAlertRuleDraftsForMode,
  validateAlertRuleDraft,
} from '@/components/alerts/alert-rule-form'
import { QueueMultiSelect } from '@/components/alerts/queue-multi-select'
import { useAppTopBar } from '@/components/app-top-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type {
  AlertWebhookDestinationRecord,
  AlertRuleMutationInput,
  AlertRuleRecord,
  AlertRuleType,
  AlertTestResult,
} from '@/hooks/use-alerts'
import {
  useTestWebhook,
  useTestWebhookDestination,
  useWebhookDestinations,
} from '@/hooks/use-alerts'
import { cn, formatNumber } from '@/lib/utils'

interface AlertRuleBuilderPageProps {
  mode: 'create' | 'edit'
  orgSlug: string
  connectionId: string
  connectionName?: string | null
  availableQueues: string[]
  rule?: AlertRuleRecord | null
  onSave: (inputs: AlertRuleMutationInput[]) => Promise<void>
  onTest?: () => Promise<AlertTestResult>
  isSaving?: boolean
  isTesting?: boolean
  linearIntegrationConfigured?: boolean
}

function NotificationRouteFields({
  route,
  index,
  ruleId,
  connectionId,
  webhookDestinations,
  onUpdate,
}: {
  route: AlertRuleDraft['notificationRoutes'][number]
  index: number
  ruleId?: string
  connectionId: string
  webhookDestinations: AlertWebhookDestinationRecord[]
  onUpdate: (nextRoute: AlertRuleDraft['notificationRoutes'][number]) => void
}) {
  const testWebhookMutation = useTestWebhook(connectionId)
  const testWebhookDestinationMutation = useTestWebhookDestination()
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null)

  async function handleTestWebhook() {
    if (route.webhookMode === 'saved') {
      const destinationId = route.webhookDestinationId?.trim()
      if (!destinationId) {
        toast.error('Choose a webhook destination before testing.')
        return
      }

      setTestingRouteId(route.id)
      try {
        const result = await testWebhookDestinationMutation.mutateAsync(destinationId)
        if (result.success) {
          toast.success('Test webhook delivered', {
            description: `HTTP ${result.httpStatus ?? 'unknown'} in ${result.durationMs}ms`,
          })
        } else {
          toast.error('Test webhook failed', {
            description: result.error ?? `HTTP ${result.httpStatus ?? 'unknown'}`,
          })
        }
      } catch (error) {
        toast.error('Test webhook failed', {
          description: error instanceof Error ? error.message : 'Unable to send test webhook.',
        })
      } finally {
        setTestingRouteId(null)
      }
      return
    }

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
    } catch (error) {
      toast.error('Test webhook failed', {
        description: error instanceof Error ? error.message : 'Unable to send test webhook.',
      })
    } finally {
      setTestingRouteId(null)
    }
  }

  if (route.type === 'email') {
    return (
      <>
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email
        </div>
        <Input
          value={route.target}
          onChange={(event) => onUpdate({ ...route, target: event.target.value })}
          placeholder="oncall@example.com"
          data-testid={`alert-rule-email-${index}`}
        />
      </>
    )
  }

  if (route.type === 'webhook') {
    const webhookMode = route.webhookMode ?? 'custom'
    return (
      <>
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          Webhook
        </div>
        <div className="grid gap-2">
          <Select
            aria-label={`Webhook mode ${index + 1}`}
            value={webhookMode}
            onChange={(event) => {
              const nextMode = event.target.value === 'saved' ? 'saved' : 'custom'
              if (nextMode === 'saved') {
                const firstDestination = webhookDestinations.find(
                  (destination) => destination.enabled
                )
                onUpdate(
                  createSavedWebhookNotificationRouteDraft(index + 1, firstDestination?.id ?? '')
                )
                return
              }
              onUpdate(createWebhookNotificationRouteDraft(index + 1))
            }}
          >
            <option value="saved">Saved destination</option>
            <option value="custom">Custom URL</option>
          </Select>

          {webhookMode === 'saved' ? (
            <Select
              aria-label={`Saved webhook destination ${index + 1}`}
              value={route.webhookDestinationId ?? route.target}
              onChange={(event) =>
                onUpdate({
                  ...route,
                  target: event.target.value,
                  webhookDestinationId: event.target.value,
                })
              }
              data-testid={`alert-rule-webhook-destination-${index}`}
            >
              <option value="">Choose a saved destination</option>
              {webhookDestinations.map((destination) => (
                <option key={destination.id} value={destination.id} disabled={!destination.enabled}>
                  {destination.name}
                  {destination.enabled ? '' : ' (disabled)'}
                </option>
              ))}
            </Select>
          ) : (
            <>
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
                placeholder="https://example.com/webhooks/durabull"
                data-testid={`alert-rule-webhook-url-${index}`}
              />
              <Input
                aria-label={`Webhook signing secret ${index + 1}`}
                type="password"
                value={route.webhookSecret ?? ''}
                onChange={(event) => onUpdate({ ...route, webhookSecret: event.target.value })}
                placeholder={
                  route.secretConfigured
                    ? `Optional — leave blank to keep existing (…${route.secretLast4 ?? ''})`
                    : 'Optional signing secret (min 16 characters)'
                }
                data-testid={`alert-rule-webhook-secret-${index}`}
              />
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => void handleTestWebhook()}
            disabled={
              testingRouteId === route.id ||
              testWebhookMutation.isPending ||
              testWebhookDestinationMutation.isPending
            }
          >
            {testingRouteId === route.id ? 'Sending test...' : 'Send test webhook'}
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="inline-flex items-center gap-2 text-sm font-medium">Linear</div>
      <div className="grid gap-2 md:grid-cols-3">
        <Input
          aria-label={`Linear team override ${index + 1}`}
          value={route.teamId ?? ''}
          onChange={(event) => onUpdate({ ...route, teamId: event.target.value })}
          placeholder="Team name, key, or ID (optional)"
          data-testid={`alert-rule-linear-team-${index}`}
        />
        <Input
          aria-label={`Linear project override ${index + 1}`}
          value={route.projectId ?? ''}
          onChange={(event) => onUpdate({ ...route, projectId: event.target.value })}
          placeholder="Project name or ID"
        />
        <Input
          aria-label={`Linear labels override ${index + 1}`}
          value={route.labelIds?.join(', ') ?? ''}
          onChange={(event) =>
            onUpdate({
              ...route,
              labelIds: event.target.value
                .split(',')
                .map((label) => label.trim())
                .filter(Boolean),
            })
          }
          placeholder="Label names or IDs"
        />
        <Input
          aria-label={`Linear assignee override ${index + 1}`}
          value={route.assigneeId ?? ''}
          onChange={(event) => onUpdate({ ...route, assigneeId: event.target.value })}
          placeholder="Assignee name, email, or ID"
        />
        <Input
          aria-label={`Linear state override ${index + 1}`}
          value={route.stateId ?? ''}
          onChange={(event) => onUpdate({ ...route, stateId: event.target.value })}
          placeholder="State name or ID"
        />
        <Input
          aria-label={`Linear priority override ${index + 1}`}
          value={route.priority ?? ''}
          onChange={(event) => onUpdate({ ...route, priority: event.target.value })}
          placeholder="Priority 0-4"
        />
      </div>
    </>
  )
}

const RULE_TYPE_EXAMPLES: Record<
  AlertRuleType,
  {
    headline: string
    example: string
    note: string
  }
> = {
  failure_threshold: {
    headline: 'Catch sudden failure spikes',
    example: 'Example: "If 25 new jobs fail in 5 minutes, open an incident immediately."',
    note: 'Best when a queue usually stays healthy and you care about abrupt changes.',
  },
  failure_rate: {
    headline: 'Detect quality degradation over time',
    example:
      'Example: "If failure rate exceeds 12% over 15 minutes with at least 250 jobs, trigger."',
    note: 'Best for high-volume queues where raw failure counts are less meaningful than error ratio.',
  },
  queue_stalled: {
    headline: 'Notice when workers stop making progress',
    example: 'Example: "If jobs are waiting but completions stop for 10 minutes, page the owner."',
    note: 'Best for stuck consumers, dead workers, or downstream systems that quietly halt throughput.',
  },
  job_failed: {
    headline: 'Create one Linear issue per failed job',
    example: 'Example: "When a job fails, create exactly one Linear issue for that job id."',
    note: 'Best when every failed job needs product or engineering follow-up without duplicate issues.',
  },
}

export function AlertRuleBuilderPage({
  mode,
  orgSlug,
  connectionId,
  connectionName,
  availableQueues,
  rule,
  onSave,
  onTest,
  isSaving = false,
  isTesting = false,
  linearIntegrationConfigured = false,
}: AlertRuleBuilderPageProps) {
  const [draft, setDraft] = useState<AlertRuleDraft>(() => createAlertRuleDraft(rule))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastTestResult, setLastTestResult] = useState<AlertTestResult | null>(null)
  const webhookDestinationsQuery = useWebhookDestinations()
  const webhookDestinations = webhookDestinationsQuery.data?.destinations ?? []
  const typeMeta = getAlertTypeMeta(draft.type)
  const exampleMeta = RULE_TYPE_EXAMPLES[draft.type]

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

  const updateDraft = (next: Partial<AlertRuleDraft>) => {
    setDraft((current) => ({ ...current, ...next }))
    setErrorMessage(null)
  }

  const activeRecipients = normalizeNotificationEmails(
    draft.notificationRoutes.filter((route) => route.type === 'email').map((route) => route.target)
  )
  const activeLinearRoutes = draft.notificationRoutes.filter((route) => route.type === 'linear')
  const activeWebhookRoutes = draft.notificationRoutes.filter((route) => route.type === 'webhook')
  const routeLimitReached = draft.notificationRoutes.length >= 10

  async function handleSubmit() {
    const validationError = validateAlertRuleDraft(draft)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    try {
      await onSave(serializeAlertRuleDraftsForMode(draft, mode))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the alert rule.')
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
      setErrorMessage(message)
      toast.error('Live test failed', { description: message })
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_360px]">
      <div className="min-w-0 space-y-8">
        <header className="border-b border-border/70 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTypeBadge type={draft.type} />
                <Badge variant="outline" className="border-border/70">
                  {connectionName ?? 'Connection'}
                </Badge>
                <Badge variant={draft.enabled ? 'success' : 'secondary'}>
                  {draft.enabled ? 'Enabled on save' : 'Muted on save'}
                </Badge>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">
                  {mode === 'create' ? 'Author a durable alert policy' : 'Refine this alert policy'}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Build an alert the way an operator thinks: choose the failure model, target the
                  right queues, route notifications, and verify the rule before it lands in
                  production.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {mode === 'edit' && onTest ? (
                <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting}>
                  <TestTube2 className="mr-1.5 h-4 w-4" />
                  {isTesting ? 'Running live test...' : 'Run live test'}
                </Button>
              ) : null}
              <Button type="button" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Saving...' : mode === 'create' ? 'Create rule' : 'Save changes'}
              </Button>
            </div>
          </div>
        </header>

        <BuilderSection
          step="01"
          title="Rule identity"
          description="Name the policy clearly so responders can understand the intent without opening the rule."
        >
          <div className="space-y-2">
            <Label htmlFor="alert-rule-name">Rule name</Label>
            <Input
              id="alert-rule-name"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="Example: Email delivery failure spike"
              data-testid="alert-rule-name-input"
            />
            <p className="text-sm text-muted-foreground">
              Keep names action-oriented. Good examples: "Payments queue stalled" or "Signup queue
              error rate".
            </p>
          </div>
        </BuilderSection>

        <BuilderSection
          step="02"
          title="Rule type"
          description="Choose the failure model you want Durabull to evaluate in the background."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {(['failure_threshold', 'failure_rate', 'queue_stalled', 'job_failed'] as const).map(
              (type) => {
                const meta = getAlertTypeMeta(type)
                const isActive = draft.type === type

                return (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      'border px-4 py-4 text-left transition-colors',
                      isActive
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border/70 bg-background hover:border-foreground/40'
                    )}
                    onClick={() => updateDraft({ type })}
                    data-testid={`alert-rule-type-${type}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{meta.label}</span>
                      {isActive ? (
                        <span className="text-xs uppercase tracking-wide">Selected</span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        'mt-3 text-sm leading-6',
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

          <div className="mt-4 border border-border/70 bg-muted/10 px-4 py-4">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              {exampleMeta.headline}
            </div>
            <p className="mt-2 font-mono text-sm">{exampleMeta.example}</p>
            <p className="mt-2 text-sm text-muted-foreground">{exampleMeta.note}</p>
          </div>
        </BuilderSection>

        <BuilderSection
          step="03"
          title="Queue coverage"
          description="Target all discovered queues on the connection or choose a searchable subset."
        >
          <div className="space-y-5">
            <QueueMultiSelect
              availableQueues={availableQueues}
              selectedQueueNames={draft.selectedQueueNames}
              onSelectedQueueNamesChange={(selectedQueueNames) =>
                updateDraft({ selectedQueueNames })
              }
              queueFilterMode={draft.queueFilterMode}
              onQueueFilterModeChange={(queueFilterMode) =>
                updateDraft({ queueFilterMode, selectedQueueNames: [] })
              }
            />
            <p className="text-sm text-muted-foreground">
              {draft.queueFilterMode === 'exclude'
                ? 'The rule applies to every discovered queue except the ones you exclude.'
                : 'The rule watches exactly the queues you select.'}
            </p>
          </div>
        </BuilderSection>

        <BuilderSection
          step="04"
          title="Detection logic"
          description="Tune the threshold, rate, or stall window that should turn normal noise into an actionable incident."
        >
          {draft.type === 'failure_threshold' ? (
            <div className="grid gap-6 md:grid-cols-2">
              <NumberField
                id="alert-threshold-count"
                label="New failures"
                value={draft.failureThresholdCount}
                onChange={(value) => updateDraft({ failureThresholdCount: value })}
                helper="The minimum number of newly failed jobs before the rule fires."
                example="Example: 25"
              />
              <NumberField
                id="alert-threshold-window"
                label="Window (minutes)"
                value={draft.failureThresholdWindowMinutes}
                onChange={(value) => updateDraft({ failureThresholdWindowMinutes: value })}
                helper="How far back Durabull should look when measuring the failure spike."
                example="Example: 5"
              />
            </div>
          ) : null}

          {draft.type === 'failure_rate' ? (
            <div className="grid gap-6 md:grid-cols-3">
              <NumberField
                id="alert-rate-percent"
                label="Failure rate (%)"
                value={draft.failureRatePercent}
                onChange={(value) => updateDraft({ failureRatePercent: value })}
                helper="The maximum acceptable error ratio inside the evaluation window."
                example="Example: 12.5"
              />
              <NumberField
                id="alert-rate-window"
                label="Window (minutes)"
                value={draft.failureRateWindowMinutes}
                onChange={(value) => updateDraft({ failureRateWindowMinutes: value })}
                helper="The rolling window used for the rate calculation."
                example="Example: 15"
              />
              <NumberField
                id="alert-rate-min-sample"
                label="Minimum sample"
                value={draft.failureRateMinSample}
                onChange={(value) => updateDraft({ failureRateMinSample: value })}
                helper="Ignore tiny volumes until enough jobs have completed or failed."
                example="Example: 250"
              />
            </div>
          ) : null}

          {draft.type === 'queue_stalled' ? (
            <div className="grid gap-6 md:grid-cols-2">
              <NumberField
                id="alert-stalled-window"
                label="Stalled after (minutes)"
                value={draft.stalledMinutes}
                onChange={(value) => updateDraft({ stalledMinutes: value })}
                helper="The amount of time jobs can wait without completions before the queue is considered stalled."
                example="Example: 10"
              />
            </div>
          ) : null}

          {draft.type === 'job_failed' ? (
            <div className="grid gap-6 md:grid-cols-2">
              <NumberField
                id="alert-job-failed-max-issues"
                label="Max issues per poll"
                value={draft.jobFailedMaxIssuesPerPoll}
                onChange={(value) => updateDraft({ jobFailedMaxIssuesPerPoll: value })}
                helper="Caps how many failed jobs Durabull will turn into Linear issues during one monitor tick."
                example="Default: 100, maximum: 500"
              />
            </div>
          ) : null}
        </BuilderSection>

        <BuilderSection
          step="05"
          title="Notification routing"
          description="Add multiple destinations for incident delivery. Linear uses the organization integration defaults unless this rule overrides them."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] gap-3 border-b border-border/70 pb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <div>Channel</div>
              <div>Destination</div>
              <div>Action</div>
            </div>

            {draft.notificationRoutes.map((route, index) => (
              <div
                key={route.id}
                className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-start gap-3"
              >
                <NotificationRouteFields
                  route={route}
                  index={index}
                  ruleId={rule?.id}
                  connectionId={connectionId}
                  webhookDestinations={webhookDestinations}
                  onUpdate={(nextRoute) => {
                    const notificationRoutes = draft.notificationRoutes.slice()
                    notificationRoutes[index] = nextRoute
                    updateDraft({ notificationRoutes })
                  }}
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
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (routeLimitReached) return
                updateDraft({
                  notificationRoutes: [...draft.notificationRoutes, createNotificationRouteDraft()],
                })
              }}
              disabled={routeLimitReached}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add email route
            </Button>
            <Button
              type="button"
              variant="outline"
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
              Add Linear route
            </Button>
            <Button
              type="button"
              variant="outline"
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
              Add webhook route
            </Button>
            <span className="text-sm text-muted-foreground">
              Up to 10 total destinations and one Linear destination per rule.
            </span>
          </div>

          <div className="mt-6 border border-dashed border-border/70 bg-muted/10 px-4 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <ComingSoonRoute
                label="Slack"
                description="Post incidents to channel-based on-call flows."
              />
              <div className="border border-border/70 bg-background/50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Webhook</span>
                  <Badge variant="success">Available</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  POST signed JSON payloads to HTTPS endpoints for automation, paging, or custom
                  incident workflows.
                </p>
              </div>
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          step="06"
          title="Operational controls"
          description="Decide whether this rule ships live right away and how aggressively Durabull should suppress repeat incidents."
        >
          <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>Rule status</Label>
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
                Muted rules are saved but won&apos;t emit incidents until you enable them later.
              </p>
            </div>

            <NumberField
              id="alert-cooldown-minutes"
              label="Cooldown (minutes)"
              value={draft.cooldownMinutes}
              onChange={(value) => updateDraft({ cooldownMinutes: value })}
              helper="If a rule keeps firing, Durabull suppresses duplicate incidents during this cooldown window."
              example="Example: 30"
            />
          </div>
        </BuilderSection>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <FlatPanel title="Plan summary">
          <div className="space-y-4 text-sm">
            <SummaryRow label="Mode" value={mode === 'create' ? 'Create' : 'Edit'} />
            <SummaryRow label="Rule type" value={typeMeta.label} />
            <SummaryRow
              label="Coverage"
              value={
                draft.queueFilterMode === 'exclude'
                  ? draft.selectedQueueNames.length === 0
                    ? 'All queues'
                    : `All except ${formatNumber(draft.selectedQueueNames.length)}`
                  : `${formatNumber(draft.selectedQueueNames.length)} queue${draft.selectedQueueNames.length === 1 ? '' : 's'}`
              }
            />
            <SummaryRow label="Rules on save" value="1" />
            <SummaryRow
              label="Routes"
              value={String(
                activeRecipients.length + activeLinearRoutes.length + activeWebhookRoutes.length
              )}
            />
          </div>
        </FlatPanel>

        <FlatPanel title="Helpful guidance">
          <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
            <li>
              Prefer failure threshold for sudden breakages and failure rate for noisy, high-volume
              queues.
            </li>
            <li>
              Use all-queues mode for shared platform protections; use specific queues for
              owner-scoped incidents.
            </li>
            <li>
              Keep cooldowns long enough to avoid paging fatigue, but short enough to notice
              persistent regressions.
            </li>
          </ul>
        </FlatPanel>

        {lastTestResult ? (
          <FlatPanel title="Latest live test">
            <div className="space-y-3 text-sm">
              <AlertStatusBadge
                status={lastTestResult.evaluation.triggered ? 'firing' : 'resolved'}
                emphasize={lastTestResult.evaluation.triggered}
              />
              <p className="leading-6 text-muted-foreground">
                {lastTestResult.evaluation.summary ||
                  'The live queue snapshot did not trigger this rule.'}
              </p>
              {lastTestResult.webhookTests && lastTestResult.webhookTests.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-medium text-foreground">Webhook delivery tests</div>
                  <div className="space-y-2">
                    {lastTestResult.webhookTests.map((test) => (
                      <div
                        key={test.url}
                        className="border border-border/70 bg-muted/20 px-3 py-2 text-xs"
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
          </FlatPanel>
        ) : null}

        {errorMessage ? (
          <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function BuilderSection({
  step,
  title,
  description,
  children,
}: {
  step: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-border/70 bg-background">
      <div className="border-b border-border/70 px-6 py-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Step {step}
        </div>
        <h3 className="mt-2 text-xl font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  helper,
  example,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  helper: string
  example: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-sm text-muted-foreground">{helper}</p>
      <p className="font-mono text-xs text-muted-foreground">{example}</p>
    </div>
  )
}

function FlatPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border/70 bg-background px-4 py-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}

function ComingSoonRoute({ label, description }: { label: string; description: string }) {
  return (
    <div className="border border-border/70 bg-background/50 px-4 py-4 opacity-55">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="secondary">Coming soon</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

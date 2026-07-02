import { Link, useNavigate } from '@tanstack/react-router'
import { BellRing, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTypeBadge,
  formatAlertDate,
  getAlertTypeMeta,
  RuleStateBadge,
} from '@/components/alerts/alert-primitives'
import { AlertsViewSwitcher } from '@/components/alerts/alerts-view-switcher'
import { RuleTemplateCards } from '@/components/alerts/rule-template-cards'
import { SnoozeMenu } from '@/components/alerts/snooze-menu'
import { useAppTopBar } from '@/components/app-top-bar'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useConnection } from '@/components/connection-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type AlertRuleRecord,
  useConnectionAlertRules,
  useDeleteAlertRule,
  useLinearIntegration,
  useUpdateAlertRule,
} from '@/hooks/use-alerts'
import { cn, formatNumber } from '@/lib/utils'

export function ConnectionRulesView({
  orgSlug,
  connectionId,
}: {
  orgSlug: string
  connectionId: string
}) {
  const navigate = useNavigate()
  const { currentConnection } = useConnection()
  const [mutatingRuleId, setMutatingRuleId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AlertRuleRecord | null>(null)

  const rulesQuery = useConnectionAlertRules(connectionId)
  const updateRuleMutation = useUpdateAlertRule(connectionId)
  const deleteRuleMutation = useDeleteAlertRule(connectionId)
  const linearIntegrationQuery = useLinearIntegration()

  const rules = rulesQuery.data?.rules ?? []
  const ruleDestinations = rulesQuery.data?.destinations
  const destinationNamesById = useMemo(
    () =>
      new Map((ruleDestinations ?? []).map((destination) => [destination.id, destination.name])),
    [ruleDestinations]
  )

  const topBarConfig = useMemo(
    () => ({
      left: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <BellRing className="h-4 w-4" />
          </span>
          <h1 className="truncate text-base font-semibold md:text-lg">Alerts</h1>
          <span className="hidden text-sm text-muted-foreground xl:inline">
            Background queue incidents, routing policy, and operator response
          </span>
        </div>
      ),
      actions: (
        <Button asChild size="xs" className="gap-2">
          <Link to="/$orgSlug/c/$connectionId/alerts/new" params={{ orgSlug, connectionId }}>
            <BellRing className="h-4 w-4" />
            Create rule
          </Link>
        </Button>
      ),
    }),
    [connectionId, orgSlug]
  )

  useAppTopBar(topBarConfig)

  async function handleToggleRule(rule: AlertRuleRecord, enabled: boolean) {
    try {
      setMutatingRuleId(rule.id)
      await updateRuleMutation.mutateAsync({
        ruleId: rule.id,
        input: { enabled },
      })

      toast.success(enabled ? 'Alert rule enabled' : 'Alert rule muted', {
        description: `${rule.name} is ${enabled ? 'live again' : 'now muted'} for ${currentConnection?.name ?? 'this connection'}.`,
      })
    } catch (error) {
      toast.error('Failed to update rule', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    } finally {
      setMutatingRuleId(null)
    }
  }

  async function handleDeleteRuleConfirmed(rule: AlertRuleRecord) {
    try {
      setMutatingRuleId(rule.id)
      await deleteRuleMutation.mutateAsync(rule.id)
      toast.success('Alert rule deleted', {
        description: `${rule.name} was removed from this connection.`,
      })
      setDeleteTarget(null)
    } catch (error) {
      toast.error('Failed to delete rule', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    } finally {
      setMutatingRuleId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AlertsViewSwitcher orgSlug={orgSlug} connectionId={connectionId} />
      </div>

      {rulesQuery.isError ? (
        <RulesErrorCard
          message="Failed to load alert rules. Retry, or refresh the page."
          onRetry={() => void rulesQuery.refetch()}
        />
      ) : rulesQuery.isLoading ? (
        <RulesLoadingState />
      ) : rules.length === 0 ? (
        <EmptyRulesState
          linearIntegrationValid={
            linearIntegrationQuery.data?.integration?.validationStatus === 'valid'
          }
          onSelectTemplate={(templateKey) =>
            navigate({
              to: '/$orgSlug/c/$connectionId/alerts/new',
              params: { orgSlug, connectionId },
              search: { template: templateKey },
            })
          }
          onStartFromScratch={() =>
            navigate({
              to: '/$orgSlug/c/$connectionId/alerts/new',
              params: { orgSlug, connectionId },
            })
          }
        />
      ) : (
        <RulesTable
          rules={rules}
          connectionId={connectionId}
          destinationNamesById={destinationNamesById}
          mutatingRuleId={mutatingRuleId}
          onRowOpen={(ruleId) =>
            navigate({
              to: '/$orgSlug/c/$connectionId/alerts/rules/$ruleId',
              params: { orgSlug, connectionId, ruleId },
            })
          }
          onToggleRule={(rule, enabled) => handleToggleRule(rule, enabled)}
          onDuplicateRule={(rule) =>
            navigate({
              to: '/$orgSlug/c/$connectionId/alerts/new',
              params: { orgSlug, connectionId },
              search: { from: rule.id },
            })
          }
          onDeleteRule={(rule) => setDeleteTarget(rule)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete alert rule"
        description={`Delete "${deleteTarget?.name ?? ''}"? Any open incidents for this rule will be resolved, and this cannot be undone.`}
        confirmLabel="Delete rule"
        destructive
        isConfirming={deleteRuleMutation.isPending}
        onConfirm={() => deleteTarget && void handleDeleteRuleConfirmed(deleteTarget)}
      />
    </div>
  )
}

function RulesTable({
  rules,
  connectionId,
  destinationNamesById,
  mutatingRuleId,
  onRowOpen,
  onToggleRule,
  onDuplicateRule,
  onDeleteRule,
}: {
  rules: AlertRuleRecord[]
  connectionId: string
  destinationNamesById: Map<string, string>
  mutatingRuleId: string | null
  onRowOpen: (ruleId: string) => void
  onToggleRule: (rule: AlertRuleRecord, enabled: boolean) => void
  onDuplicateRule: (rule: AlertRuleRecord) => void
  onDeleteRule: (rule: AlertRuleRecord) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Rule</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Coverage</TableHead>
            <TableHead>Cooldown</TableHead>
            <TableHead>Recipients</TableHead>
            <TableHead>Routing</TableHead>
            <TableHead className="w-[220px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const meta = getAlertTypeMeta(rule.type)
            const routingLabels = rule.notificationChannels.flatMap((channel) => {
              if (channel.type === 'email') return [channel.target]
              if (channel.type === 'destination') {
                return [destinationNamesById.get(channel.destinationId) ?? 'Saved destination']
              }
              if (channel.type === 'webhook' && 'destinationId' in channel) {
                return [destinationNamesById.get(channel.destinationId) ?? 'Saved webhook']
              }
              return []
            })
            const isBusy = mutatingRuleId === rule.id
            const isSnoozed = rule.state === 'snoozed'

            return (
              <TableRow
                key={rule.id}
                className={cn('cursor-pointer', isSnoozed && 'text-muted-foreground')}
                onClick={() => onRowOpen(rule.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRowOpen(rule.id)
                  }
                }}
                tabIndex={0}
              >
                <TableCell className="min-w-[240px]">
                  <div className="space-y-1">
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      {meta.description}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <AlertTypeBadge type={rule.type} compact />
                </TableCell>
                <TableCell>
                  {isSnoozed ? (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <RuleStateBadge state={rule.state} mutedUntil={rule.mutedUntil} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 space-y-1">
                          <p>Snoozed until {formatAlertDate(rule.mutedUntil)}</p>
                          <p className="text-primary-foreground/80">
                            Snoozing silences checks temporarily — open incidents stay until it
                            wakes. Muting is permanent until re-enabled.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <RuleStateBadge state={rule.state} mutedUntil={rule.mutedUntil} />
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rule.queueFilterMode === 'include' && rule.filterQueueNames.length > 0
                    ? `${formatNumber(rule.filterQueueNames.length)} queue${rule.filterQueueNames.length === 1 ? '' : 's'}`
                    : rule.queueFilterMode === 'exclude' && rule.filterQueueNames.length > 0
                      ? `All except ${formatNumber(rule.filterQueueNames.length)}`
                      : (rule.queueName ?? 'All queues')}
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">
                  {formatNumber(rule.cooldownMinutes)} min
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">
                  {formatNumber(routingLabels.length)}
                </TableCell>
                <TableCell className="max-w-[240px]">
                  {routingLabels.length > 0 ? (
                    <div className="truncate text-sm text-muted-foreground">
                      {routingLabels.join(', ')}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">No routing</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <SnoozeMenu rule={rule} connectionId={connectionId} disabled={isBusy} />
                    <Button
                      type="button"
                      variant={rule.enabled ? 'outline' : 'default'}
                      size="xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleRule(rule, !rule.enabled)
                      }}
                      disabled={isBusy}
                    >
                      {rule.enabled ? 'Mute' : 'Enable'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDuplicateRule(rule)
                      }}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteRule(rule)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyRulesState({
  linearIntegrationValid,
  onSelectTemplate,
  onStartFromScratch,
}: {
  linearIntegrationValid: boolean
  onSelectTemplate: (templateKey: string) => void
  onStartFromScratch: () => void
}) {
  return (
    <Card className="border-border/70 bg-muted/15">
      <CardContent className="space-y-5 py-8">
        <div className="text-center">
          <h3 className="text-xl font-semibold">Start with a template</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            No alert rules yet — templates preload a sensible condition, queue scope, and cooldown
            for common queue incidents. Everything stays editable.
          </p>
        </div>
        <RuleTemplateCards
          linearIntegrationValid={linearIntegrationValid}
          onSelectTemplate={(template) => onSelectTemplate(template.key)}
          onStartFromScratch={onStartFromScratch}
        />
      </CardContent>
    </Card>
  )
}

function RulesLoadingState() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
      <Skeleton className="h-10 w-full rounded-none" />
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function RulesErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <ShieldCheck className="h-8 w-8 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Unable to load alert data</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  )
}

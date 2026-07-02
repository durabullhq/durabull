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
import { SnoozeMenu } from '@/components/alerts/snooze-menu'
import { useAppTopBar } from '@/components/app-top-bar'
import { useConnection } from '@/components/connection-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

  const rulesQuery = useConnectionAlertRules(connectionId)
  const updateRuleMutation = useUpdateAlertRule(connectionId)
  const deleteRuleMutation = useDeleteAlertRule(connectionId)

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

  async function handleDeleteRule(rule: AlertRuleRecord) {
    if (
      !window.confirm(`Delete "${rule.name}"? Any active incidents for this rule will be resolved.`)
    ) {
      return
    }

    try {
      setMutatingRuleId(rule.id)
      await deleteRuleMutation.mutateAsync(rule.id)
      toast.success('Alert rule deleted', {
        description: `${rule.name} was removed from this connection.`,
      })
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
        <RulesErrorCard message="Failed to load alert rules. Please try refreshing the page." />
      ) : rulesQuery.isLoading ? (
        <RulesLoadingState />
      ) : rules.length === 0 ? (
        <EmptyRulesState orgSlug={orgSlug} connectionId={connectionId} />
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
          onDeleteRule={(rule) => handleDeleteRule(rule)}
        />
      )}
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

function EmptyRulesState({ orgSlug, connectionId }: { orgSlug: string; connectionId: string }) {
  return (
    <Card className="border-dashed border-border/70 bg-muted/15">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full border border-border/70 bg-background/70 p-4">
          <BellRing className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-5 text-xl font-semibold">No alert rules yet</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Create your first queue incident policy to catch failure spikes, degraded quality, or
          stalled workers on this connection.
        </p>
        <Button asChild className="mt-5 gap-2">
          <Link to="/$orgSlug/c/$connectionId/alerts/new" params={{ orgSlug, connectionId }}>
            <BellRing className="h-4 w-4" />
            Create alert rule
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function RulesLoadingState() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index}>
          <CardHeader className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-7 w-60" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, tileIndex) => (
                <Skeleton key={tileIndex} className="h-20 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-20 rounded-2xl" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function RulesErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <ShieldCheck className="h-8 w-8 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Unable to load alert data</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

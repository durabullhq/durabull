import { Link, useNavigate } from '@tanstack/react-router'
import { BellOff, Copy, MoreHorizontal, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  formatAlertDate,
  getAlertTypeMeta,
  RuleStateBadge,
} from '@/components/alerts/alert-primitives'
import { buildSentenceTokens, createAlertRuleDraft } from '@/components/alerts/alert-rule-form'
import { AlertsHeader } from '@/components/alerts/alerts-view-switcher'
import { RuleTemplateCards } from '@/components/alerts/rule-template-cards'
import { SnoozeMenu } from '@/components/alerts/snooze-menu'
import { useAppTopBar } from '@/components/app-top-bar'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useConnection } from '@/components/connection-provider'
import { PageTitle } from '@/components/page-title'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/section'
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
      left: <PageTitle title="Alerts" />,
      actions: (
        <Button asChild size="xs">
          <Link to="/$orgSlug/c/$connectionId/alerts/new" params={{ orgSlug, connectionId }}>
            <Plus className="h-3.5 w-3.5" />
            New rule
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
    <div className="space-y-4">
      <AlertsHeader orgSlug={orgSlug} connectionId={connectionId} />

      {rulesQuery.isError ? (
        <Panel>
          <EmptyState
            size="inline"
            icon={ShieldAlert}
            tone="danger"
            title="Unable to load alert data"
            description="Failed to load alert rules. Retry, or refresh the page."
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void rulesQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        </Panel>
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
          destinations={ruleDestinations ?? []}
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

type RuleDestinations = Parameters<typeof buildSentenceTokens>[1]

function RulesTable({
  rules,
  connectionId,
  destinationNamesById,
  destinations,
  mutatingRuleId,
  onRowOpen,
  onToggleRule,
  onDuplicateRule,
  onDeleteRule,
}: {
  rules: AlertRuleRecord[]
  connectionId: string
  destinationNamesById: Map<string, string>
  destinations: RuleDestinations
  mutatingRuleId: string | null
  onRowOpen: (ruleId: string) => void
  onToggleRule: (rule: AlertRuleRecord, enabled: boolean) => void
  onDuplicateRule: (rule: AlertRuleRecord) => void
  onDeleteRule: (rule: AlertRuleRecord) => void
}) {
  return (
    <Panel>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Rule</TableHead>
            <TableHead>Watches</TableHead>
            <TableHead>Notifies</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="w-px">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const meta = getAlertTypeMeta(rule.type)
            const TypeIcon = meta.icon
            // Say what the rule actually checks ("≥ 25 new failures within 5 min"),
            // not what its type means in general.
            const tokens = buildSentenceTokens(createAlertRuleDraft(rule), destinations)
            const condition = tokens.find((token) => token.key === 'condition')?.label
            const cooldown = tokens.find((token) => token.key === 'cooldown')?.label
            const routingLabels = rule.notificationChannels.flatMap((channel) => {
              if (channel.type === 'email') return [channel.target]
              if (channel.type === 'destination') {
                return [destinationNamesById.get(channel.destinationId) ?? 'Saved destination']
              }
              if (channel.type === 'webhook' && 'destinationId' in channel) {
                return [destinationNamesById.get(channel.destinationId) ?? 'Saved webhook']
              }
              if (channel.type === 'webhook' && 'url' in channel && channel.url) {
                return [channel.url]
              }
              if (channel.type === 'linear') return ['Linear']
              return []
            })
            const isBusy = mutatingRuleId === rule.id
            const isSnoozed = rule.state === 'snoozed'

            return (
              <TableRow
                key={rule.id}
                data-testid="alert-rule-row"
                className={cn('cursor-pointer', !rule.enabled && 'text-muted-foreground')}
                onClick={() => onRowOpen(rule.id)}
                onKeyDown={(event) => {
                  // Ignore keys bubbling from nested action buttons/menus.
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRowOpen(rule.id)
                  }
                }}
                tabIndex={0}
              >
                <TableCell className="min-w-[260px] py-2.5">
                  <div className="flex items-start gap-2.5">
                    <TypeIcon
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-label={meta.label}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{rule.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {condition ?? meta.description}
                        {cooldown ? <span className="text-faint"> · {cooldown}</span> : null}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {rule.type === 'redis_health'
                    ? 'Redis server'
                    : rule.queueFilterMode === 'include' && rule.filterQueueNames.length > 0
                      ? `${formatNumber(rule.filterQueueNames.length)} queue${rule.filterQueueNames.length === 1 ? '' : 's'}`
                      : rule.queueFilterMode === 'exclude' && rule.filterQueueNames.length > 0
                        ? `All except ${formatNumber(rule.filterQueueNames.length)}`
                        : (rule.queueName ?? 'All queues')}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  {routingLabels.length > 0 ? (
                    <div className="truncate" title={routingLabels.join(', ')}>
                      {routingLabels.join(', ')}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-status-warning">
                      <BellOff className="h-3.5 w-3.5" aria-hidden />
                      No one
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
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
                <TableCell className="py-1 pr-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <SnoozeMenu rule={rule} connectionId={connectionId} disabled={isBusy} />
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="w-[58px]"
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleRule(rule, !rule.enabled)
                      }}
                      disabled={isBusy}
                    >
                      {rule.enabled ? 'Mute' : 'Enable'}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`More actions for ${rule.name}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-40"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenuItem onClick={() => onRowOpen(rule.id)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicateRule(rule)}>
                          <Copy />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-status-danger focus:text-status-danger"
                          onClick={() => onDeleteRule(rule)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Panel>
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
    <Panel className="px-5 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Start with a template</h3>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-muted-foreground">
            No alert rules yet. Templates preload a sensible condition, queue scope, and cooldown
            for common queue incidents — everything stays editable.
          </p>
        </div>
        <RuleTemplateCards
          linearIntegrationValid={linearIntegrationValid}
          onSelectTemplate={(template) => onSelectTemplate(template.key)}
          onStartFromScratch={onStartFromScratch}
        />
      </div>
    </Panel>
  )
}

function RulesLoadingState() {
  return (
    <Panel className="divide-y">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </Panel>
  )
}

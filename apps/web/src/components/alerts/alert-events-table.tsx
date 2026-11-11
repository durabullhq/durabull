import { Link } from '@tanstack/react-router'
import { ArrowUpRight, CheckCheck, Eye, Loader2, MoreHorizontal, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { AlertEventDetailsDialog } from '@/components/alerts/alert-event-details-dialog'
import { formatActorSuffix, getSuppressedCount } from '@/components/alerts/alert-event-helpers'
import {
  AlertStatusBadge,
  formatAlertDate,
  formatRelativeAlertTime,
  getAlertEventDisplayStatus,
  getAlertTypeMeta,
} from '@/components/alerts/alert-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AlertEventRecord } from '@/hooks/use-alerts'
import { cn } from '@/lib/utils'

interface AlertEventsTableProps {
  orgSlug: string
  events: AlertEventRecord[]
  emptyTitle: string
  emptyCopy: string
  showConnectionColumn?: boolean
  connectionNameForEvent?: (event: AlertEventRecord) => string
  getRuleName?: (event: AlertEventRecord) => string | undefined
  onResolve?: (event: AlertEventRecord) => void
  resolvingEventId?: string | null
  onAcknowledge?: (eventId: string) => void
  acknowledgingEventId?: string | null
}

interface IncidentRowActions {
  openDetails: () => void
  resolve?: (event: AlertEventRecord) => void
  acknowledge?: (eventId: string) => void
  isResolving: boolean
  isAcknowledging: boolean
}

export function AlertEventsTable({
  orgSlug,
  events,
  emptyTitle,
  emptyCopy,
  showConnectionColumn = false,
  connectionNameForEvent,
  getRuleName,
  onResolve,
  resolvingEventId,
  onAcknowledge,
  acknowledgingEventId,
}: AlertEventsTableProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  if (events.length === 0) {
    return <EmptyState size="inline" title={emptyTitle} description={emptyCopy} />
  }

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  return (
    <TooltipProvider delayDuration={200}>
      <div>
        <AlertEventDetailsDialog
          event={selectedEvent}
          open={selectedEvent !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedEventId(null)
          }}
        />
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {showConnectionColumn ? <TableHead>Connection</TableHead> : null}
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="hidden md:table-cell">Rule</TableHead>
              <TableHead>Queue</TableHead>
              <TableHead className="w-full">Summary</TableHead>
              <TableHead className="hidden md:table-cell">Delivery</TableHead>
              <TableHead className="hidden text-right md:table-cell">Fired</TableHead>
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <AlertEventRow
                key={event.id}
                orgSlug={orgSlug}
                event={event}
                showConnectionColumn={showConnectionColumn}
                connectionName={connectionNameForEvent?.(event)}
                ruleName={getRuleName?.(event)}
                actions={{
                  openDetails: () => setSelectedEventId(event.id),
                  resolve: onResolve,
                  acknowledge: onAcknowledge,
                  isResolving: resolvingEventId === event.id,
                  isAcknowledging: acknowledgingEventId === event.id,
                }}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}

function AlertEventRow({
  orgSlug,
  event,
  showConnectionColumn,
  connectionName,
  ruleName,
  actions,
}: {
  orgSlug: string
  event: AlertEventRecord
  showConnectionColumn: boolean
  connectionName?: string
  ruleName?: string
  actions: IncidentRowActions
}) {
  const displayStatus = getAlertEventDisplayStatus(event)
  const suppressedCount = getSuppressedCount(event)
  const canAcknowledge = displayStatus === 'firing' && Boolean(actions.acknowledge)
  const canResolve = event.status === 'firing' && Boolean(actions.resolve)
  const isActing = actions.isResolving || actions.isAcknowledging

  return (
    <TableRow
      className={cn(
        'group cursor-pointer',
        displayStatus === 'firing' && 'shadow-[inset_2px_0_0_0_var(--color-status-danger)]',
        displayStatus === 'acknowledged' && 'shadow-[inset_2px_0_0_0_var(--color-status-warning)]',
        displayStatus === 'suppressed' && 'opacity-60'
      )}
      onClick={actions.openDetails}
    >
      {showConnectionColumn ? (
        <TableCell className="whitespace-nowrap font-medium">
          {connectionName ?? 'Unknown connection'}
        </TableCell>
      ) : null}
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <AlertStatusBadge
            status={event.status}
            acknowledged={displayStatus === 'acknowledged'}
            emphasize={displayStatus === 'firing'}
          />
          {displayStatus === 'suppressed' && suppressedCount > 1 ? (
            <Badge variant="secondary">×{suppressedCount}</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {ruleName ? (
          <span className="block max-w-[180px] truncate font-medium" title={ruleName}>
            {ruleName}
          </span>
        ) : (
          <span className="block max-w-[180px] truncate text-muted-foreground">
            {getAlertTypeMeta(event.type).label}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {event.type === 'redis_health' ? (
          <span className="inline-flex max-w-[200px] items-center text-muted-foreground">
            {event.queueName}
          </span>
        ) : (
          <Link
            to="/$orgSlug/c/$connectionId/queues/$queueName"
            params={{
              orgSlug,
              connectionId: event.connectionId,
              queueName: event.queueName,
            }}
            className="inline-flex max-w-[200px] items-center gap-1 font-mono text-xs underline decoration-transparent underline-offset-4 transition-colors hover:decoration-border-strong"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
          >
            <span className="truncate">{event.queueName}</span>
            <ArrowUpRight className="h-3 w-3 shrink-0 text-faint" />
          </Link>
        )}
      </TableCell>
      <TableCell className="max-w-0">
        <p className="line-clamp-2 break-words" title={event.summary}>
          {event.summary}
        </p>
        {displayStatus === 'acknowledged' ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Ack'd{formatActorSuffix(event.acknowledgedByName)} ·{' '}
            {formatRelativeAlertTime(event.acknowledgedAt)}
          </p>
        ) : null}
        {displayStatus === 'resolved' && event.resolvedAt ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Resolved {formatRelativeAlertTime(event.resolvedAt)}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="hidden max-w-[180px] md:table-cell">
        <DeliverySummary event={event} />
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-right md:table-cell">
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A real button so keyboard focus reveals the absolute timestamp. */}
            <button
              type="button"
              className="cursor-default rounded-sm text-xs tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              {formatRelativeAlertTime(event.firedAt)}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{formatAlertDate(event.firedAt)}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="whitespace-nowrap py-1 pr-2">
        <div className="flex items-center justify-end gap-1">
          {/* The two things an on-call engineer does to an incident are one click away. */}
          {canAcknowledge ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="hidden lg:inline-flex"
              disabled={isActing}
              aria-label="Acknowledge incident"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation()
                actions.acknowledge?.(event.id)
              }}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Ack
            </Button>
          ) : null}
          {canResolve ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="hidden lg:inline-flex"
              disabled={isActing}
              aria-label="Mark incident resolved"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation()
                actions.resolve?.(event)
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Resolve
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isActing}
                onClick={(clickEvent) => clickEvent.stopPropagation()}
              >
                {isActing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {actions.isResolving
                    ? 'Resolving incident'
                    : actions.isAcknowledging
                      ? 'Acknowledging incident'
                      : 'Incident actions'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <DropdownMenuItem onClick={actions.openDetails}>
                <Eye className="mr-2 h-4 w-4" />
                View details
              </DropdownMenuItem>
              {canAcknowledge || canResolve ? <DropdownMenuSeparator /> : null}
              {canAcknowledge ? (
                <DropdownMenuItem onClick={() => actions.acknowledge?.(event.id)}>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Acknowledge
                </DropdownMenuItem>
              ) : null}
              {canResolve ? (
                <DropdownMenuItem onClick={() => actions.resolve?.(event)}>
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Resolve
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

function DeliverySummary({ event }: { event: AlertEventRecord }) {
  const linearDelivery = event.deliveries.find((delivery) => delivery.channelType === 'linear')
  if (linearDelivery?.externalUrl) {
    return (
      <a
        href={linearDelivery.externalUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        {linearDelivery.externalIdentifier ?? 'Linear issue'}
        <ArrowUpRight className="h-3 w-3" />
      </a>
    )
  }
  if (linearDelivery?.status === 'failed') {
    return (
      <span
        className="block truncate text-xs text-status-danger"
        title={linearDelivery.lastError ?? undefined}
      >
        Linear failed{linearDelivery.lastError ? `: ${linearDelivery.lastError}` : ''}
      </span>
    )
  }

  const webhookDelivery = event.deliveries.find((delivery) => delivery.channelType === 'webhook')
  if (webhookDelivery) {
    const httpStatus = webhookDelivery.providerMetadata?.httpStatus
    if (webhookDelivery.status === 'delivered') {
      return (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          Webhook {typeof httpStatus === 'number' ? `HTTP ${httpStatus}` : 'delivered'}
        </span>
      )
    }
    if (webhookDelivery.status === 'failed') {
      return (
        <span
          className="block truncate text-xs text-status-danger"
          title={webhookDelivery.lastError ?? undefined}
        >
          Webhook failed{webhookDelivery.lastError ? `: ${webhookDelivery.lastError}` : ''}
        </span>
      )
    }
    return <span className="whitespace-nowrap text-xs text-muted-foreground">Webhook pending</span>
  }

  if (linearDelivery) {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">Linear pending</span>
  }

  if (event.deliveries.length > 0) {
    const delivered = event.deliveries.filter((delivery) => delivery.status === 'delivered').length
    return (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {delivered}/{event.deliveries.length} delivered
      </span>
    )
  }

  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      {event.notificationSentAt ? 'Delivered' : 'Not sent'}
    </span>
  )
}

import { ArrowUpRight, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertStatusBadge,
  AlertTypeBadge,
  formatAlertDate,
} from '@/components/alerts/alert-primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  type AlertDeliveryRecord,
  type AlertEventRecord,
  useRetryAlertDelivery,
} from '@/hooks/use-alerts'

const CHANNEL_LABELS: Record<AlertDeliveryRecord['channelType'], string> = {
  email: 'Email',
  linear: 'Linear',
  webhook: 'Webhook',
}

const DELIVERY_STATUS_VARIANT: Record<
  AlertDeliveryRecord['status'],
  'success' | 'destructive' | 'warning' | 'outline'
> = {
  delivered: 'success',
  failed: 'destructive',
  claimed: 'warning',
  pending: 'outline',
}

function isRetryable(status: AlertDeliveryRecord['status']): boolean {
  return status === 'failed' || status === 'claimed'
}

interface AlertEventDetailsDialogProps {
  event: AlertEventRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AlertEventDetailsDialog({
  event,
  open,
  onOpenChange,
}: AlertEventDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {event ? <AlertEventDetails event={event} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AlertEventDetails({ event }: { event: AlertEventRecord }) {
  const retryMutation = useRetryAlertDelivery()
  const contextEntries = formatContextEntries(event.context)

  async function handleRetry(delivery: AlertDeliveryRecord) {
    try {
      await retryMutation.mutateAsync({
        connectionId: event.connectionId,
        eventId: event.id,
        deliveryId: delivery.id,
      })
      toast.success('Delivery retried', {
        description: `Re-attempted ${CHANNEL_LABELS[delivery.channelType]} delivery.`,
      })
    } catch (error) {
      toast.error('Retry failed', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <AlertStatusBadge status={event.status} emphasize={event.status === 'firing'} />
          <AlertTypeBadge type={event.type} compact />
          <Badge variant="outline" className="border-border/70 bg-background/70">
            {event.queueName}
          </Badge>
        </div>
        <DialogTitle className="pt-2 text-base leading-6">{event.summary}</DialogTitle>
        <DialogDescription>
          Fired {formatAlertDate(event.firedAt)}
          {event.status === 'resolved' && event.resolvedAt
            ? ` · Resolved ${formatAlertDate(event.resolvedAt)}`
            : ''}
        </DialogDescription>
      </DialogHeader>

      {contextEntries.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Event context
          </h4>
          <dl className="grid gap-x-4 gap-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm sm:grid-cols-[160px_1fr]">
            {contextEntries.map(({ label, value }) => (
              <div key={label} className="contents">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="break-words font-mono text-xs">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Delivery attempts
        </h4>
        {event.deliveries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 bg-muted/15 p-3 text-sm text-muted-foreground">
            No notification channels were configured when this alert fired, so nothing was
            delivered.
          </p>
        ) : (
          <ul className="space-y-2">
            {event.deliveries.map((delivery) => (
              <DeliveryRow
                key={delivery.id}
                delivery={delivery}
                onRetry={() => handleRetry(delivery)}
                isRetrying={
                  retryMutation.isPending && retryMutation.variables?.deliveryId === delivery.id
                }
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function DeliveryRow({
  delivery,
  onRetry,
  isRetrying,
}: {
  delivery: AlertDeliveryRecord
  onRetry: () => void
  isRetrying: boolean
}) {
  const httpStatus = delivery.providerMetadata?.httpStatus
  const responseSnippet = delivery.providerMetadata?.responseBodySnippet

  return (
    <li className="rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{CHANNEL_LABELS[delivery.channelType]}</span>
            <Badge variant={DELIVERY_STATUS_VARIANT[delivery.status]} className="capitalize">
              {delivery.status}
            </Badge>
            {typeof delivery.attemptCount === 'number' && delivery.attemptCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {delivery.attemptCount} attempt{delivery.attemptCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          {delivery.target ? (
            <p className="truncate font-mono text-xs text-muted-foreground">{delivery.target}</p>
          ) : null}
        </div>
        {isRetryable(delivery.status) ? (
          <Button type="button" size="xs" variant="outline" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Retrying
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </>
            )}
          </Button>
        ) : null}
      </div>

      {delivery.externalUrl ? (
        <a
          href={delivery.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {delivery.externalIdentifier ?? 'Open Linear issue'}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      ) : null}

      {typeof httpStatus === 'number' ? (
        <p className="mt-2 text-xs text-muted-foreground">HTTP {httpStatus}</p>
      ) : null}

      {delivery.lastError ? (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {delivery.lastError}
        </pre>
      ) : null}

      {typeof responseSnippet === 'string' && responseSnippet.length > 0 ? (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-muted/20 p-2 text-xs text-muted-foreground">
          {responseSnippet}
        </pre>
      ) : null}
    </li>
  )
}

function formatContextEntries(
  context: Record<string, unknown>
): Array<{ label: string; value: string }> {
  const entries: Array<{ label: string; value: string }> = []
  for (const [key, raw] of Object.entries(context ?? {})) {
    if (raw === null || raw === undefined || raw === '') continue
    const value =
      typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
        ? String(raw)
        : JSON.stringify(raw)
    entries.push({ label: humanizeKey(key), value })
  }
  return entries
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

import { Download, ExternalLink, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type BillingInvoice, useBillingInvoices } from '@/hooks/use-billing'
import { formatBillingDate, formatMoney } from './billing-state'

const STATUS: Record<
  BillingInvoice['status'],
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  open: { label: 'Due', variant: 'warning' },
  uncollectible: { label: 'Unpaid', variant: 'warning' },
  void: { label: 'Void', variant: 'neutral' },
}

function InvoiceRow({ invoice }: { invoice: BillingInvoice }) {
  const status = STATUS[invoice.status]
  const due = invoice.status === 'open' && invoice.amountDue > 0
  return (
    <TableRow data-testid="invoice-row">
      <TableCell className="whitespace-nowrap font-mono tabular-nums">
        {formatBillingDate(invoice.created)}
      </TableCell>
      <TableCell className="truncate font-mono text-xs text-muted-foreground">
        {invoice.number ?? 'Invoice'}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
        {formatMoney(invoice.total, invoice.currency)}
      </TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {invoice.hostedInvoiceUrl ? (
            <Button asChild size="xs" variant={due ? 'default' : 'ghost'}>
              <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                {due ? null : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                {due ? 'Pay now' : 'View'}
              </a>
            </Button>
          ) : null}
          {invoice.invoicePdf ? (
            <Button asChild size="xs" variant="ghost">
              <a
                href={invoice.invoicePdf}
                aria-label={`Download invoice ${invoice.number ?? ''} as PDF`.replace('  ', ' ')}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                PDF
              </a>
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * The organization's recent invoices, one click from the billing page. Each
 * links to Stripe's hosted invoice (to view, pay or download a receipt) and
 * its PDF. The full history stays in the Customer Portal.
 */
export function InvoicesCard({ onOpenPortal }: { onOpenPortal: () => void }) {
  const { data, isLoading, error, refetch, isFetching } = useBillingInvoices({ enabled: true })
  const invoices = data?.invoices ?? []

  return (
    <Panel id="invoices" data-testid="invoices-card">
      <PanelHeader>
        <div>
          <h3 className="text-[13px] font-semibold">Invoices</h3>
          <p className="text-xs text-muted-foreground">Your most recent invoices and receipts.</p>
        </div>
        <Button type="button" variant="outline" size="xs" onClick={onOpenPortal}>
          All invoices
        </Button>
      </PanelHeader>
      {isLoading ? (
        <div className="divide-y">
          {[0, 1].map((row) => (
            <div key={row} className="flex h-11 items-center gap-4 px-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <span className="text-muted-foreground">
            {error instanceof Error && error.message
              ? error.message
              : 'Invoices could not be loaded right now.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          size="inline"
          icon={FileText}
          title="No invoices yet"
          description="They appear here after your first payment."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Number</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Links</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  )
}

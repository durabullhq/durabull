import type { JobDependenciesResponse, JobDependencyKind } from '@/hooks/use-queues'

const children: Record<JobDependencyKind, JobDependenciesResponse['children']> = {
  unprocessed: [
    { key: 'bull:orders:order-1042', queueName: 'orders', jobId: 'order-1042', status: 'waiting' },
    {
      key: 'bull:payments:payment-1042',
      queueName: 'payments',
      jobId: 'payment-1042',
      status: 'failed',
    },
  ],
  processed: [
    {
      key: 'bull:inventory:inventory-1042',
      queueName: 'inventory',
      jobId: 'inventory-1042',
      status: 'unknown',
    },
  ],
  failed: [
    {
      key: 'bull:exports:export-1042',
      queueName: 'exports',
      jobId: 'export-1042',
      status: 'failed',
    },
  ],
  ignored: [
    {
      key: 'bull:enrichment:enrichment-1042',
      queueName: 'enrichment',
      jobId: 'enrichment-1042',
      status: 'failed',
    },
  ],
}

export function jobDependenciesFixture(url: URL, empty: boolean): JobDependenciesResponse {
  const requestedKind = url.searchParams.get('kind')
  const kind =
    requestedKind && Object.hasOwn(children, requestedKind)
      ? (requestedKind as JobDependencyKind)
      : 'unprocessed'
  return {
    kind,
    status: empty ? 'completed' : 'waiting-children',
    parent: empty
      ? null
      : {
          key: 'bull:reports:monthly-report',
          queueName: 'reports',
          jobId: 'monthly-report',
          status: 'waiting-children',
        },
    counts: empty
      ? { unprocessed: 0, processed: 0, failed: 0, ignored: 0 }
      : { unprocessed: 2, processed: 1, failed: 1, ignored: 1 },
    children: empty ? [] : children[kind],
    nextCursor: null,
  }
}

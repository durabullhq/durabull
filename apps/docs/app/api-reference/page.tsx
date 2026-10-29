import type { Metadata } from 'next'
import { ContentPage } from '@/components/v2/content-page'
import { SiteLayout } from '@/components/v2/site-layout'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'API Reference',
    description: "Automate queue operations and observability with Durabull's REST endpoints.",
    keywords: ['Durabull API', 'BullMQ API', 'queue automation', 'REST API'],
  },
  '/api-reference'
)

export default function ApiReferencePage() {
  return (
    <SiteLayout>
      <ContentPage
        label="Developer APIs"
        title="API Reference"
        intro="Automate queue operations and observability with Durabull's REST endpoints."
        primaryCta={{ label: 'HTTP API Reference', to: '/documentation/reference/http-api' }}
        secondaryCta={{ label: 'Browse Docs', to: '/documentation' }}
        sections={[
          {
            title: 'Queues',
            description: 'Inspect queue health, pause/resume queues, and review throughput.',
            items: ['List queues', 'Toggle pause', 'Fetch metrics'],
          },
          {
            title: 'Jobs',
            description: 'Retrieve job history and automate retries.',
            items: ['Query by status', 'Retry or remove', 'View payload metadata'],
          },
          {
            title: 'Signals',
            description: 'Send alert notifications to your tooling.',
            items: ['Webhook subscriptions', 'Alert thresholds', 'Status checks'],
          },
        ]}
        note="The REST API ships with every deployment and uses session authentication. See the reference for authless mode and scoped MCP access."
      />
    </SiteLayout>
  )
}

import type { Metadata } from 'next'
import { V2FinalCta } from '@/components/v2/closing'
import { V2Problem, V2ValueGrid } from '@/components/v2/features'
import { PageHeading } from '@/components/v2/page-heading'
import { V2Showcase } from '@/components/v2/showcase'
import { SiteLayout } from '@/components/v2/site-layout'
import { createAbsoluteMetadata, createBreadcrumbSchema } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'Features',
    description:
      'Powerful BullMQ dashboard features: real-time monitoring, job debugging, worker tracking, scheduled jobs, team collaboration, and more.',
    keywords: [
      'BullMQ features',
      'queue monitoring',
      'job debugging',
      'worker tracking',
      'scheduled jobs',
      'Redis queue dashboard',
    ],
  },
  '/features'
)

export default function FeaturesPage() {
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Features', url: '/features' },
            ])
          ),
        }}
      />
      <PageHeading label="Features" title="Every control surface for running BullMQ.">
        <p>
          Monitor queues, debug failed jobs, manage schedulers, and route alerts from one dashboard,
          or hand the same controls to your agent through Durabull MCP.
        </p>
      </PageHeading>
      <V2ValueGrid />
      <V2Showcase />
      <V2Problem />
      <V2FinalCta />
    </SiteLayout>
  )
}

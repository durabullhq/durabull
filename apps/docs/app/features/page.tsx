import type { Metadata } from 'next'
import { V2FinalCta } from '@/components/v2/closing'
import { ContentGrid, type ContentSection } from '@/components/v2/content-page'
import { V2Problem } from '@/components/v2/features'
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

const capabilities: ContentSection[] = [
  {
    title: 'Unified queue command center',
    description:
      'Track waiting, active, delayed, completed, and failed jobs from one automatically refreshed dashboard.',
  },
  {
    title: 'Failure analysis with full context',
    description:
      'Inspect stack traces, attempt history, payload metadata, and retry controls in one place when incidents happen.',
  },
  {
    title: 'Cron visibility that scales',
    description: 'Review next runs and create, edit, or remove cron and interval schedulers.',
  },
  {
    title: 'Worker and connection awareness',
    description:
      'Understand where jobs run across environments and workers so on-call decisions happen with confidence.',
  },
  {
    title: 'Redis insight without guesswork',
    description:
      'Inspect key structures and queue internals directly from the UI while keeping production troubleshooting focused.',
  },
  {
    title: 'Throughput trends across queues',
    description:
      'Visualize throughput and backlog across queues. Throughput charts require BullMQ worker metrics.',
  },
  {
    title: 'Developer-first security posture',
    description:
      'Designed for teams that need observability and control without sacrificing governance, access boundaries, or auditability.',
  },
]

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
          Durabull is built for engineering teams that need speed during incidents and clarity
          during everyday queue operations.
        </p>
      </PageHeading>
      <ContentGrid label="Production capabilities" sections={capabilities} />
      <V2Showcase />
      <V2Problem />
      <V2FinalCta />
    </SiteLayout>
  )
}

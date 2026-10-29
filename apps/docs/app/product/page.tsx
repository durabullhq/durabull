import type { Metadata } from 'next'
import { V2FinalCta } from '@/components/v2/closing'
import { V2Deploy } from '@/components/v2/deploy'
import { PageHeading } from '@/components/v2/page-heading'
import { V2ProductTour } from '@/components/v2/showcase'
import { SiteLayout } from '@/components/v2/site-layout'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'Product',
    description:
      'See Durabull in action. A beautiful, intuitive dashboard for managing your BullMQ queues.',
    keywords: ['BullMQ dashboard', 'queue management', 'job monitoring', 'Redis dashboard'],
  },
  '/product'
)

export default function ProductPage() {
  return (
    <SiteLayout>
      <PageHeading label="Product tour" title="One surface for your whole queue lifecycle.">
        <p>
          From triaging failed jobs to validating scheduled workloads, Durabull keeps every
          operational path visible, fast, and inspectable.
        </p>
      </PageHeading>
      <V2ProductTour />
      <V2Deploy />
      <V2FinalCta />
    </SiteLayout>
  )
}

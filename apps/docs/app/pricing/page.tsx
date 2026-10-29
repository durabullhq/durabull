import type { Metadata } from 'next'
import { V2FinalCta } from '@/components/v2/closing'
import { V2Deploy } from '@/components/v2/deploy'
import { PageHeading } from '@/components/v2/page-heading'
import { V2BillingFaq, V2PlanComparison, V2PricingPlans } from '@/components/v2/pricing-page'
import { SiteLayout } from '@/components/v2/site-layout'
import { PRICING_FAQS } from '@/lib/pricing'
import {
  createAbsoluteMetadata,
  createBreadcrumbSchema,
  createFAQSchema,
  createProductSchema,
} from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'Pricing',
    description:
      'Durabull Cloud pricing per organization: Free, Team at $9/month, Business at $29/month, and Enterprise by agreement. No per-job fees; self-hosting is free under Apache-2.0.',
    keywords: [
      'BullMQ dashboard pricing',
      'Durabull pricing',
      'BullMQ monitoring cost',
      'hosted BullMQ dashboard',
    ],
  },
  '/pricing'
)

export default function PricingPage() {
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            createProductSchema(),
            createFAQSchema([...PRICING_FAQS]),
            createBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Pricing', url: '/pricing' },
            ]),
          ]),
        }}
      />
      <PageHeading
        label="Pricing · One price per organization"
        title="Simple, predictable pricing."
      >
        <p>
          Operate BullMQ across your environments for one team price. Your workers keep running on
          your infrastructure, and there are no per-job fees.
        </p>
      </PageHeading>
      <V2PricingPlans />
      <V2PlanComparison />
      <V2Deploy />
      <V2BillingFaq />
      <V2FinalCta />
    </SiteLayout>
  )
}

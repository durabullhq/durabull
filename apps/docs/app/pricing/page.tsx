import type { Metadata } from 'next'
import { LandingLayout } from '@/components'
import { PricingContent } from '@/components/pricing/pricing-content'
import { PRICING_FAQS } from '@/lib/pricing'
import {
  createBreadcrumbSchema,
  createFAQSchema,
  createMetadata,
  createProductSchema,
} from '@/lib/seo'

export const metadata: Metadata = createMetadata(
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
    <LandingLayout>
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
      <PricingContent />
    </LandingLayout>
  )
}

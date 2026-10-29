import type { Metadata } from 'next'
import { FaqContact, FaqList } from '@/components/v2/faq'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { faqs } from '@/lib/faqs'
import { createAbsoluteMetadata, createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'FAQ',
    description:
      'Frequently asked questions about Durabull. Learn about BullMQ dashboard features, pricing, security, authless mode, and persistence options.',
    keywords: [
      'BullMQ FAQ',
      'Durabull questions',
      'queue monitoring help',
      'BullMQ dashboard support',
    ],
  },
  '/faq'
)

export default function FAQPage() {
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            createFAQSchema(faqs),
            createBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'FAQ', url: '/faq' },
            ]),
          ]),
        }}
      />
      <PageHeading label="FAQ" title="Frequently asked questions.">
        <p>
          How Durabull works with BullMQ and Redis, what agents can do through Durabull MCP, and how
          to run it in the cloud, on your desktop, or on your own network.
        </p>
      </PageHeading>
      <section aria-label="Questions" className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <FaqList items={faqs} />
        <FaqContact />
      </section>
    </SiteLayout>
  )
}

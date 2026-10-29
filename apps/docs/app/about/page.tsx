import type { Metadata } from 'next'
import { ContentPage } from '@/components/v2/content-page'
import { SiteLayout } from '@/components/v2/site-layout'
import { CONTACT_EMAIL } from '@/lib/config'
import { createAbsoluteMetadata, createBreadcrumbSchema, createOrganizationSchema } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'About',
    description:
      'Learn about Durabull, the team behind it, and our mission to bring clarity, reliability, and speed to BullMQ operations.',
    keywords: ['about Durabull', 'BullMQ dashboard team', 'queue monitoring company'],
  },
  '/about'
)

export default function AboutPage() {
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            createOrganizationSchema(),
            createBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'About', url: '/about' },
            ]),
          ]),
        }}
      />
      <ContentPage
        label="Our Story"
        title="About Durabull"
        intro="We built Durabull to bring clarity, reliability, and speed to BullMQ operations."
        primaryCta={{ label: 'Meet the Team', to: '/contact' }}
        secondaryCta={{ label: 'View Product', to: '/product' }}
        sections={[
          {
            title: 'Queue Operations',
            description:
              'Inspect BullMQ jobs, debug failures, and manage queues and schedulers from one dashboard.',
          },
          {
            title: 'Community-Driven',
            description: 'Durabull evolves with feedback from teams shipping BullMQ in production.',
          },
          {
            title: 'Deployment Options',
            description:
              'Durabull is open source under Apache-2.0. Self-host with PostgreSQL or persistent PGlite storage, or use the desktop app.',
          },
        ]}
        note={`Questions about Durabull? Email us at ${CONTACT_EMAIL}.`}
      />
    </SiteLayout>
  )
}

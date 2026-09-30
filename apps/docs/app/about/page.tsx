import type { Metadata } from 'next'
import { LandingLayout, MarketingPage } from '@/components'
import { createBreadcrumbSchema, createMetadata, createOrganizationSchema } from '@/lib/seo'

export const metadata: Metadata = createMetadata(
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
    <LandingLayout>
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
      <MarketingPage
        badge="Our Story"
        title="About Durabull"
        subtitle="We built Durabull to bring clarity, reliability, and speed to BullMQ operations."
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
              'Durabull is source-available under ELv2. Self-host with PostgreSQL or persistent PGlite storage, or use the desktop app.',
          },
        ]}
        footerNote="Questions about Durabull? Email us at hello@durabull.io."
      />
    </LandingLayout>
  )
}

import type { Metadata } from 'next'
import { LandingLayout, MarketingPage } from '@/components'
import { createMetadata } from '@/lib/seo'

export const metadata: Metadata = createMetadata(
  {
    title: 'Roadmap',
    description:
      'Our near-term focus is reliability, collaboration, and authless + persistence flexibility.',
    keywords: ['Durabull roadmap', 'BullMQ dashboard roadmap', 'upcoming features'],
  },
  '/roadmap'
)

export default function RoadmapPage() {
  return (
    <LandingLayout>
      <MarketingPage
        badge="What's Next"
        title="Roadmap"
        subtitle="Our near-term focus is reliability, collaboration, and authless + persistence flexibility."
        primaryCta={{ label: 'Join the Beta', to: '/signup' }}
        secondaryCta={{ label: 'Read Changelog', to: '/changelog' }}
        sections={[
          {
            title: 'Now',
            description: 'Stability and speed across large queues.',
            items: [
              'Latency improvements for busy dashboards',
              'Queue health alerts',
              'Webhook alert notifications',
              'Faster job replays',
            ],
          },
          {
            title: 'Next',
            description: 'Collaboration and workflow improvements.',
            items: ['Role-based access controls', 'Saved views and filters', 'Slack notifications'],
          },
          {
            title: 'Later',
            description: 'Long-term platform expansion.',
            items: ['Authless deployment guide', 'Plugin marketplace', 'Advanced audit logging'],
          },
        ]}
        footerNote="Have a roadmap request? Reach out at hello@durabull.io."
      />
    </LandingLayout>
  )
}

import type { Metadata } from 'next'
import { ContentPage } from '@/components/v2/content-page'
import { SiteLayout } from '@/components/v2/site-layout'
import { WEB_APP_URL } from '@/lib/config'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
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
    <SiteLayout>
      <ContentPage
        label="What's Next"
        title="Roadmap"
        intro="Our near-term focus is reliability, collaboration, and authless + persistence flexibility."
        primaryCta={{ label: 'Start Free', to: `${WEB_APP_URL}/signup` }}
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
        note="Have a roadmap request? Reach out at hello@durabull.io."
      />
    </SiteLayout>
  )
}

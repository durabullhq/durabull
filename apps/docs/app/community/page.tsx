import type { Metadata } from 'next'
import { ContentPage } from '@/components/v2/content-page'
import { SiteLayout } from '@/components/v2/site-layout'
import { CONTACT_EMAIL } from '@/lib/config'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'Community',
    description: 'Join the developers improving BullMQ operations and sharing best practices.',
    keywords: ['Durabull community', 'BullMQ community', 'queue management community'],
  },
  '/community'
)

export default function CommunityPage() {
  return (
    <SiteLayout>
      <ContentPage
        label="Connect with Us"
        title="Community"
        intro="Join the developers improving BullMQ operations and sharing best practices."
        primaryCta={{ label: 'Follow on X', to: 'https://x.com/durabullhq' }}
        secondaryCta={{ label: 'View on GitHub', to: 'https://github.com/durabullhq/durabull' }}
        sections={[
          {
            title: 'Discuss queue operations',
            description: "Share questions and feedback through the project's GitHub repository.",
          },
          {
            title: 'Open Source',
            description:
              'Explore the codebase, self-host under Apache-2.0, and contribute on GitHub.',
          },
          {
            title: 'Community Stories',
            description: 'Share how you run BullMQ — we love spotlighting the community.',
          },
        ]}
        note={`Want to host a community session? Reach out at ${CONTACT_EMAIL}.`}
      />
    </SiteLayout>
  )
}

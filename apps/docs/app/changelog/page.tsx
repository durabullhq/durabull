import type { Metadata } from 'next'
import { ContentPage } from '@/components/v2/content-page'
import { SiteLayout } from '@/components/v2/site-layout'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'Changelog',
    description: "See what's new in Durabull — from fresh features to reliability upgrades.",
    keywords: ['Durabull changelog', 'BullMQ dashboard updates', 'product updates'],
  },
  '/changelog'
)

export default function ChangelogPage() {
  return (
    <SiteLayout>
      <ContentPage
        label="Product Updates"
        title="Changelog"
        intro="See what's new in Durabull — from fresh features to reliability upgrades."
        primaryCta={{
          label: 'View Releases',
          to: 'https://github.com/durabullhq/durabull/releases',
        }}
        secondaryCta={{ label: 'View Roadmap', to: '/roadmap' }}
        sections={[
          {
            title: 'Release notes',
            description: 'See published versions, release notes, and desktop assets on GitHub.',
          },
        ]}
        note="Looking for a specific update? Email us at hello@durabull.io."
      />
    </SiteLayout>
  )
}

import type { Metadata } from 'next'
import { LandingLayout, MarketingPage } from '@/components'
import { createMetadata } from '@/lib/seo'

export const metadata: Metadata = createMetadata(
  {
    title: 'Changelog',
    description: "See what's new in Durabull — from fresh features to reliability upgrades.",
    keywords: ['Durabull changelog', 'BullMQ dashboard updates', 'product updates'],
  },
  '/changelog'
)

export default function ChangelogPage() {
  return (
    <LandingLayout>
      <MarketingPage
        badge="Product Updates"
        title="Changelog"
        subtitle="See what's new in Durabull — from fresh features to reliability upgrades."
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
        footerNote="Looking for a specific update? Email us at hello@durabull.io."
      />
    </LandingLayout>
  )
}

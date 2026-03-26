import type { Metadata } from 'next'
import { LandingLayout, MarketingPage } from '@/components'
import { createBreadcrumbSchema, createMetadata } from '@/lib/seo'

export const metadata: Metadata = createMetadata(
  {
    title: 'Documentation',
    description:
      'Durabull documentation. Learn how to install the desktop app, self-host confidently, connect BullMQ, and manage queues with clear operational guides.',
    keywords: [
      'Durabull docs',
      'BullMQ documentation',
      'queue monitoring guide',
      'Redis dashboard setup',
    ],
  },
  '/docs'
)

export default function DocsPage() {
  return (
    <LandingLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createBreadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Documentation', url: '/docs' },
            ])
          ),
        }}
      />
      <MarketingPage
        badge="Documentation"
        title="Durabull Documentation"
        subtitle="Friendly guides for desktop installs, self-hosting, day-to-day operations, and incident response in BullMQ environments."
        primaryCta={{
          label: 'Desktop Install Guide',
          to: '/documentation/getting-started/desktop-apps',
        }}
        secondaryCta={{ label: 'Open Documentation', to: '/documentation' }}
        sections={[
          {
            title: 'Desktop Apps',
            description:
              'Install Durabull on Apple Silicon macOS or Windows, or roll out Apple Silicon Macs with Homebrew using the current release assets.',
            items: [
              'Direct Apple Silicon macOS download',
              'Windows installer and zip options',
              'Homebrew cask command and verification steps',
            ],
          },
          {
            title: 'Start Here',
            description: 'Learn how the app is organized and what to do first.',
            items: [
              'Desktop app installation',
              'How to use Durabull',
              'Architecture and mode matrix',
              'Connection and auth model',
            ],
          },
          {
            title: 'Self Hosting',
            description: 'Set up confidently with clear setup, installation, and Docker guides.',
            items: ['Setup path selection', 'Installation walkthrough', 'Docker image and Compose'],
          },
          {
            title: 'Using Durabull',
            description: 'Operate queues, jobs, workers, and schedulers with best practices.',
            items: [
              'Queue and job workflows',
              'Naming best practices',
              'Log formatting and triage',
            ],
          },
        ]}
        footerNote="Need a specific guide added? Open an issue or contact hello@durabull.io."
      />
    </LandingLayout>
  )
}

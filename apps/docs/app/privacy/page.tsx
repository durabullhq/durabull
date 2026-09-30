import type { Metadata } from 'next'
import { LandingLayout, MarketingPage } from '@/components'
import { createMetadata } from '@/lib/seo'

export const metadata: Metadata = createMetadata(
  {
    title: 'Privacy Policy',
    description: 'A clear summary of how we handle data while Durabull is in beta.',
    keywords: ['Durabull privacy', 'privacy policy', 'data handling'],
  },
  '/privacy'
)

export default function PrivacyPage() {
  return (
    <LandingLayout>
      <MarketingPage
        badge="Privacy"
        title="Privacy Policy"
        subtitle="A clear summary of how we handle data while Durabull is in beta."
        primaryCta={{ label: 'Contact Us', to: '/contact' }}
        sections={[
          {
            title: 'Data We Collect',
            description: 'We only collect what is needed to operate the product.',
            items: [
              'Account details and authentication',
              'Queue metadata, metrics, and job payloads, results, logs, and stack traces processed for inspection',
              'Anonymous/pseudonymous usage telemetry',
            ],
          },
          {
            title: 'Anonymous Telemetry',
            description:
              'Production enables sanitized usage telemetry. Forwarding requires a signing secret and is best-effort; optional operator-configured PostHog receives a separate browser analytics stream.',
            items: [
              'Feature and route usage',
              'Safe runtime context and aggregate counts',
              'No Redis URLs, queue names, Redis key names, job data, logs, emails, names, organizations, or raw error messages',
            ],
          },
          {
            title: 'How We Use Data',
            description: 'We use data to operate, improve, and secure Durabull.',
            items: [
              'Deliver the dashboard experience',
              'Improve reliability and performance',
              'Prevent abuse',
            ],
          },
          {
            title: 'Your Choices',
            description:
              'Self-host when job-data processing must stay in your deployment. Contact us with privacy or account-data requests.',
            items: [
              'Choose your deployment',
              'Review organization access',
              'Contact hello@durabull.io',
            ],
          },
        ]}
        footerNote="See the documentation for telemetry configuration and security guidance."
      />
    </LandingLayout>
  )
}

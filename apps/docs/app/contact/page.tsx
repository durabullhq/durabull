import type { Metadata } from 'next'
import { LandingLayout, MarketingPage } from '@/components'
import { createMetadata } from '@/lib/seo'

export const metadata: Metadata = createMetadata(
  {
    title: 'Contact',
    description:
      'We are here to help with onboarding, support, and BullMQ observability questions.',
    keywords: ['contact Durabull', 'BullMQ support', 'queue monitoring help'],
  },
  '/contact'
)

export default function ContactPage() {
  return (
    <LandingLayout>
      <MarketingPage
        badge="Let's Talk"
        title="Contact"
        subtitle="We are here to help with onboarding, support, and BullMQ observability questions."
        primaryCta={{ label: 'Email Us', to: 'mailto:hello@durabull.io' }}
        secondaryCta={{ label: 'Start Free', to: '/signup' }}
        sections={[
          {
            title: 'Support',
            description: 'Get help with setup, troubleshooting, or account questions.',
            items: ['hello@durabull.io'],
          },
          {
            title: 'Partnerships',
            description: 'Discuss integrations, ecosystem tools, or co-marketing.',
            items: ['Partner opportunities', 'Community workshops'],
          },
          {
            title: 'Security',
            description: 'Report security issues or request compliance details.',
            items: ['Responsible disclosure', 'Security reviews'],
          },
        ]}
        footerNote="Prefer a call? Email us and we will schedule a time."
      />
    </LandingLayout>
  )
}

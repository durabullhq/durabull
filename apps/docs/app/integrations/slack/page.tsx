import type { Metadata } from 'next'
import {
  SlackFaq,
  SlackFeatures,
  SlackFinalCta,
  SlackHero,
  SlackInstallSteps,
  SlackSecurity,
} from '@/components/integrations/slack-landing'
import { SiteLayout } from '@/components/v2/site-layout'
import { SITE_URL } from '@/lib/config'
import { createAbsoluteMetadata, createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { slackFaqs } from '@/lib/slack-faqs'

export const metadata: Metadata = createAbsoluteMetadata(
  {
    title: 'Durabull for Slack: BullMQ alerts and incident response in Slack',
    description:
      'Send BullMQ alert incidents to Slack, acknowledge, resolve, snooze and retry from the message, and check queues, incidents and jobs with /durabull. Included with Durabull Team and above.',
    keywords: [
      'BullMQ Slack',
      'BullMQ alerts',
      'Slack incident response',
      'queue monitoring Slack',
      'Redis queue alerts',
      'Slack app',
    ],
  },
  '/integrations/slack'
)

export default function SlackIntegrationPage() {
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            createBreadcrumbSchema([
              { name: 'Home', url: SITE_URL },
              { name: 'Integrations', url: `${SITE_URL}/integrations/slack` },
              { name: 'Slack', url: `${SITE_URL}/integrations/slack` },
            ]),
            createFAQSchema(slackFaqs),
          ]),
        }}
      />
      <SlackHero />
      <SlackFeatures />
      <SlackInstallSteps />
      <SlackSecurity />
      <SlackFaq />
      <SlackFinalCta />
    </SiteLayout>
  )
}

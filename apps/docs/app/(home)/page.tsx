import type { Metadata } from 'next'
import { V2FinalCta, V2Footer } from '@/components/v2/closing'
import { V2Deploy, V2Pricing } from '@/components/v2/deploy'
import { V2Faq } from '@/components/v2/faq'
import { V2GettingStarted, V2Problem, V2ValueGrid } from '@/components/v2/features'
import { V2Hero } from '@/components/v2/hero'
import { V2LogoMarquee } from '@/components/v2/logo-marquee'
import { V2Nav } from '@/components/v2/nav'
import { V2Showcase } from '@/components/v2/showcase'
import {
  createMetadata,
  createOrganizationSchema,
  createSoftwareApplicationSchema,
  createWebSiteSchema,
} from '@/lib/seo'

export const metadata: Metadata = createMetadata(
  {
    title: 'Durabull — See every job. Fix every failure.',
    description:
      'The BullMQ operations platform built for on-call speed. Zero code changes: point Durabull at Redis and get fleet analytics, failure debugging, scheduler control, and proactive alerts.',
    keywords: [
      'BullMQ',
      'Redis',
      'queue',
      'job queue',
      'background jobs',
      'admin dashboard',
      'monitoring',
      'Node.js',
      'Apple Silicon macOS app',
      'Windows app',
      'Homebrew',
    ],
  },
  '/'
)

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            createWebSiteSchema(),
            createOrganizationSchema(),
            createSoftwareApplicationSchema(),
          ]),
        }}
      />
      <V2Nav />
      <main>
        <V2Hero />
        <V2LogoMarquee />
        <V2ValueGrid />
        <V2Showcase />
        <V2Problem />
        <V2Deploy />
        <V2GettingStarted />
        <V2Pricing />
        <V2Faq />
        <V2FinalCta />
      </main>
      <V2Footer />
    </>
  )
}

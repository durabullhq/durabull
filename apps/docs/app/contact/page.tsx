import { ArrowRight, ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { createMetadata } from '@/lib/seo'

const baseMetadata = createMetadata(
  {
    title: 'Contact',
    description: 'Talk to the Durabull team about setup, support, partnerships, or security.',
    keywords: ['contact Durabull', 'BullMQ support', 'queue monitoring help'],
  },
  '/contact'
)

export const metadata: Metadata = {
  ...baseMetadata,
  title: { absolute: 'Contact | Durabull' },
}

const topics = [
  {
    title: 'Support',
    description:
      'Need help connecting Redis, inspecting a queue, or setting up your agent? Tell us where you’re stuck.',
    subject: 'Durabull support',
    action: 'Get support',
  },
  {
    title: 'Partnerships',
    description:
      'Building something for the BullMQ ecosystem? Talk to us about integrations, community projects, or working together.',
    subject: 'Durabull partnership',
    action: 'Talk partnerships',
  },
  {
    title: 'Security',
    description:
      'Report a vulnerability privately or ask about security and compliance. Email the team directly.',
    subject: 'Durabull security',
    action: 'Contact security',
  },
] as const

export default function ContactPage() {
  return (
    <SiteLayout>
      <PageHeading label="Contact" title="Talk to the team.">
        <p>
          From your first Redis connection to a queue that needs a closer look, we’re here to help.
        </p>
        <a
          href="mailto:hello@durabull.io"
          className="mt-7 inline-flex items-center gap-3 text-xl font-medium text-[var(--v2-fg)] underline decoration-[var(--v2-accent)] underline-offset-8 transition-colors hover:text-[var(--v2-accent)] sm:text-2xl"
        >
          hello@durabull.io
          <ArrowUpRight aria-hidden className="size-5 text-[var(--v2-accent)]" />
        </a>
      </PageHeading>

      <section
        aria-label="Contact options"
        className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="v2-h text-2xl">How can we help?</h2>
            <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--v2-muted)]">
              One inbox, straight to the team. Include your deployment type and what you’re trying
              to do. Keep credentials and customer data out of your message.
            </p>
          </div>
          <div className="divide-y divide-[var(--v2-line)] border-y border-[var(--v2-line)]">
            {topics.map((topic) => (
              <div
                key={topic.title}
                className="grid gap-4 py-8 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8"
              >
                <div>
                  <h3 className="v2-h text-xl">{topic.title}</h3>
                  <p className="mt-2 max-w-xl text-[15px] leading-7 text-[var(--v2-muted)]">
                    {topic.description}
                  </p>
                </div>
                <a
                  href={`mailto:hello@durabull.io?subject=${encodeURIComponent(topic.subject)}`}
                  className="group inline-flex items-center gap-2 text-sm font-medium text-[var(--v2-fg)] underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-accent)]"
                >
                  {topic.action}
                  <ArrowUpRight
                    aria-hidden
                    className="size-4 text-[var(--v2-accent)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
          <div>
            <h2 className="v2-h text-xl">Looking for a setup guide?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--v2-muted)]">
              Cloud, desktop, self-hosting, and MCP—all in the docs.
            </p>
          </div>
          <Link
            href="/documentation"
            className="v2-btn-ghost inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium"
          >
            Read the documentation
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </SiteLayout>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { createMetadata } from '@/lib/seo'

const baseMetadata = createMetadata(
  {
    title: 'Terms of Service',
    description: 'Simple guidelines for using Durabull responsibly during the beta.',
    keywords: ['Durabull terms', 'terms of service', 'usage guidelines'],
  },
  '/terms'
)

export const metadata: Metadata = {
  ...baseMetadata,
  title: { absolute: 'Terms of Service | Durabull' },
}

const sections = [
  {
    title: 'Using the Service',
    description: 'Keep your credentials safe and use the platform responsibly.',
    items: ['Protect your login details', 'Follow BullMQ best practices', 'Respect rate limits'],
  },
  {
    title: 'Account Responsibilities',
    description: 'You are responsible for your data and usage.',
    items: ['Maintain accurate account info', 'Review access permissions', 'Notify us of issues'],
  },
  {
    title: 'Fair Usage',
    description: 'We reserve the right to ensure the service remains stable for all users.',
    items: ['Avoid abusive traffic', 'Report incidents promptly', 'Work with us on scale needs'],
  },
] as const

export default function TermsPage() {
  return (
    <SiteLayout>
      <PageHeading label="Legal · Durabull" title="Terms of Service">
        <p>Simple guidelines for using Durabull responsibly during the beta.</p>
      </PageHeading>

      <article
        aria-label="Terms of service"
        className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <aside>
            <p className="v2-mono text-[var(--v2-muted)]">Questions about these terms?</p>
            <Link
              href="/contact"
              className="mt-4 inline-block text-sm font-medium underline decoration-[var(--v2-accent)] underline-offset-4"
            >
              Contact the team
            </Link>
          </aside>
          <div className="max-w-3xl">
            <div className="space-y-10">
              {sections.map((section, index) => (
                <section
                  key={section.title}
                  aria-labelledby={`terms-${index}`}
                  className="border-b border-[var(--v2-line)] pb-10"
                >
                  <h2 id={`terms-${index}`} className="v2-h text-2xl">
                    {index + 1}. {section.title}
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-[var(--v2-muted)]">
                    {section.description}
                  </p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-[var(--v2-muted)] marker:text-[var(--v2-accent)]">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="mt-8 text-sm leading-7 text-[var(--v2-muted)]">
              Terms will evolve as Durabull matures. Reach out with questions.
            </p>
          </div>
        </div>
      </article>
    </SiteLayout>
  )
}

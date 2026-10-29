import { ArrowRight, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { WEB_APP_URL } from '@/lib/config'
import { PageHeading } from './page-heading'

export interface ContentSection {
  title: string
  description: string
  items?: string[]
}

export interface ContentCta {
  label: string
  to: string
}

interface ContentPageProps {
  label: string
  title: string
  intro: string
  sections: ContentSection[]
  primaryCta?: ContentCta
  secondaryCta?: ContentCta
  note?: ReactNode
}

function CtaLink({ cta, primary = false }: { cta: ContentCta; primary?: boolean }) {
  const className = `inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold ${
    primary ? 'v2-btn-accent' : 'v2-btn-ghost'
  }`
  const external = cta.to.startsWith('http') || cta.to.startsWith('mailto:')
  const Icon = external ? ArrowUpRight : ArrowRight
  const content = (
    <>
      {cta.label}
      <Icon aria-hidden className="size-4" />
    </>
  )

  if (external) {
    return (
      <a href={cta.to} className={className}>
        {content}
      </a>
    )
  }
  // Auth routes live on the web app, not this site.
  if (cta.to === '/signup' || cta.to === '/login') {
    return (
      <a href={`${WEB_APP_URL}${cta.to}`} className={className}>
        {content}
      </a>
    )
  }
  return (
    <Link href={cta.to} className={className}>
      {content}
    </Link>
  )
}

/** Page heading, a bordered grid of topic cells, and an optional closing note. */
export function ContentPage({
  label,
  title,
  intro,
  sections,
  primaryCta,
  secondaryCta,
  note,
}: ContentPageProps) {
  const columns =
    sections.length >= 3 ? 'lg:grid-cols-3' : sections.length === 2 ? 'sm:grid-cols-2' : ''

  return (
    <>
      <PageHeading label={label} title={title}>
        <p>{intro}</p>
        {primaryCta || secondaryCta ? (
          <div className="mt-8 flex flex-wrap gap-3">
            {primaryCta ? <CtaLink cta={primaryCta} primary /> : null}
            {secondaryCta ? <CtaLink cta={secondaryCta} /> : null}
          </div>
        ) : null}
      </PageHeading>

      <section aria-label={title} className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div
          className={`grid gap-px border border-[var(--v2-line)] bg-[var(--v2-line)] ${
            sections.length > 3 ? 'sm:grid-cols-2' : columns
          }`}
        >
          {sections.map((section, i) => (
            <div key={section.title} className="v2-cell flex flex-col p-7">
              <span aria-hidden className="v2-cell-ticks" />
              <p className="v2-mono text-[var(--v2-faint)]">{String(i + 1).padStart(2, '0')}</p>
              <h2 className="v2-h mt-3 text-lg">{section.title}</h2>
              <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--v2-muted)]">
                {section.description}
              </p>
              {section.items?.length ? (
                <ul className="mt-5 grid gap-2">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[13.5px] text-[var(--v2-fg)]"
                    >
                      <span
                        aria-hidden
                        className="mt-[7px] size-1.5 shrink-0 bg-[var(--v2-accent)]"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {note ? (
        <section className="border-t border-[var(--v2-line)] bg-[var(--v2-bg-2)]">
          <p className="mx-auto max-w-7xl px-5 py-10 text-sm leading-6 text-[var(--v2-muted)] sm:px-8">
            {note}
          </p>
        </section>
      ) : null}
    </>
  )
}

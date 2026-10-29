import { ArrowRight, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
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

  // Off-site links (GitHub, the web app, mail) leave the Next.js router.
  if (cta.to.startsWith('http') || cta.to.startsWith('mailto:')) {
    return (
      <a href={cta.to} className={className}>
        {cta.label}
        <ArrowUpRight aria-hidden className="size-4" />
      </a>
    )
  }
  return (
    <Link href={cta.to} className={className}>
      {cta.label}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  )
}

function gridColumns(count: number): string {
  if (count === 2 || count === 4) return 'sm:grid-cols-2'
  if (count === 3) return 'lg:grid-cols-3'
  if (count > 4) return 'sm:grid-cols-2 lg:grid-cols-3'
  return ''
}

/** Stretch a trailing odd cell across the row so the grid never shows an empty slot. */
function lastCellSpan(count: number): string {
  if (count <= 4) return ''
  const sm = count % 2 === 1 ? 'sm:col-span-2' : ''
  const lg = count % 3 === 1 ? 'lg:col-span-3' : sm ? 'lg:col-span-1' : ''
  return `${sm} ${lg}`
}

/** Bordered grid of numbered topic cells with optional bullet lists. */
export function ContentGrid({ label, sections }: { label: string; sections: ContentSection[] }) {
  return (
    <section aria-label={label} className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <div
        className={`grid gap-px border border-[var(--v2-line)] bg-[var(--v2-line)] ${gridColumns(
          sections.length
        )}`}
      >
        {sections.map((section, i) => (
          <div
            key={section.title}
            className={`v2-cell flex flex-col p-7 ${
              i === sections.length - 1 ? lastCellSpan(sections.length) : ''
            }`}
          >
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
  )
}

/** Page heading, a content grid, and an optional closing note. */
export function ContentPage({
  label,
  title,
  intro,
  sections,
  primaryCta,
  secondaryCta,
  note,
}: ContentPageProps) {
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

      <ContentGrid label={title} sections={sections} />

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

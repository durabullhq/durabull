import Link from 'next/link'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { competitors } from '@/lib/compare/catalog'
import type { Competitor } from '@/lib/compare/types'
import { SITE_URL } from '@/lib/config'
import { createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { CompareFaqList } from './faq-list'
import { JsonLd } from './json-ld'
import { CompareCta, McpBand, SectionIntro } from './prose-blocks'

function peersFor(target: Competitor): Competitor[] {
  const sameCategory = competitors.filter(
    (item) => item.category === target.category && item.slug !== target.slug && !item.discontinued
  )
  const named = target.related
    .map((slug) => competitors.find((item) => item.slug === slug))
    .filter((item): item is Competitor => item !== undefined)
  const merged = [...named]
  for (const item of sameCategory) {
    if (!merged.some((existing) => existing.slug === item.slug)) merged.push(item)
  }
  return merged.slice(0, 8)
}

export function AlternativesPage({ competitor }: { competitor: Competitor }) {
  const peers = peersFor(competitor)
  const title = competitor.alternativesTitle ?? `${competitor.name} alternatives`
  const faqs = [
    {
      question: `What is the best ${competitor.shortName} alternative?`,
      answer: `Durabull if you want Redis auto-discovery, multiple environments, and a BullMQ MCP server. ${competitor.whenToChooseThem}`,
    },
    {
      question: `When should I keep ${competitor.shortName}?`,
      answer: competitor.whenToChooseThem,
    },
    ...competitor.faqs.slice(0, 2),
  ]

  return (
    <SiteLayout>
      <JsonLd
        data={[
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Compare', url: `${SITE_URL}/compare` },
            { name: title, url: `${SITE_URL}/alternatives/${competitor.slug}` },
          ]),
          createFAQSchema(faqs),
        ]}
      />

      <PageHeading label="Alternatives" title={title}>
        <p>
          {competitor.alternativesDescription ??
            `Other ways to get the job ${competitor.shortName} does, and when Durabull is the better fit.`}
        </p>
      </PageHeading>

      <div className="mx-auto max-w-7xl space-y-16 px-5 py-14 sm:px-8 sm:py-20">
        <McpBand />

        <section className="border border-[var(--v2-line)] p-6 sm:p-8">
          <p className="v2-mono text-[var(--v2-accent)]">First alternative</p>
          <h2 className="v2-h mt-2 text-3xl">Durabull</h2>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[var(--v2-muted)]">
            {competitor.whenToChooseDurabull}
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link
              href={`/compare/${competitor.slug}`}
              className="font-medium underline underline-offset-4"
            >
              Full Durabull vs {competitor.shortName}
            </Link>
            <Link href="/mcp" className="font-medium underline underline-offset-4">
              Durabull MCP
            </Link>
          </div>
        </section>

        <section>
          <SectionIntro title={`When ${competitor.shortName} is still the right pick`}>
            {competitor.whenToChooseThem}
          </SectionIntro>
        </section>

        <section>
          <SectionIntro title="Other names in the same search" />
          <ul className="divide-y divide-[var(--v2-line)] border-y border-[var(--v2-line)]">
            {peers.map((item) => (
              <li key={item.slug} className="grid gap-2 py-5 sm:grid-cols-[220px_minmax(0,1fr)]">
                <Link
                  href={`/compare/${item.slug}`}
                  className="v2-h text-lg hover:text-[var(--v2-accent)]"
                >
                  {item.name}
                </Link>
                <p className="text-[14.5px] leading-6 text-[var(--v2-muted)]">{item.oneLiner}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionIntro title="FAQ" />
          <CompareFaqList faqs={faqs} />
        </section>
      </div>

      <CompareCta />
    </SiteLayout>
  )
}

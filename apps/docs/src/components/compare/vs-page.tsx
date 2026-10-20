import Link from 'next/link'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { articles, articlePath } from '@/lib/compare/articles'
import { relatedCompetitors } from '@/lib/compare/catalog'
import type { Competitor } from '@/lib/compare/types'
import { SITE_URL } from '@/lib/config'
import { createBreadcrumbSchema, createFAQSchema, createSoftwareApplicationSchema } from '@/lib/seo'
import { CompareFaqList } from './faq-list'
import { JsonLd } from './json-ld'
import { CompareTable, CostTable } from './compare-table'
import { CompareCta, McpBand, RelatedLinks, SectionIntro, SourceList } from './prose-blocks'

export function VsPage({ competitor }: { competitor: Competitor }) {
  const related = relatedCompetitors(competitor.slug)
  const relatedArticles = articles.filter((article) =>
    article.relatedCompare.includes(competitor.slug)
  )

  return (
    <SiteLayout>
      <JsonLd
        data={[
          createSoftwareApplicationSchema(),
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Compare', url: `${SITE_URL}/compare` },
            { name: competitor.name, url: `${SITE_URL}/compare/${competitor.slug}` },
          ]),
          createFAQSchema(competitor.faqs),
        ]}
      />

      <PageHeading label="Compare" title={`Durabull vs ${competitor.name}`}>
        <p>{competitor.intro}</p>
        <p className="mt-4">
          <a
            href={competitor.website}
            className="underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-accent)]"
          >
            {competitor.name} website
          </a>
          {competitor.discontinued ? ' · Discontinued' : null}
          {competitor.unverifiedLiveSite ? ' · Live site not verified' : null}
        </p>
      </PageHeading>

      <div className="mx-auto max-w-7xl space-y-16 px-5 py-14 sm:px-8 sm:py-20">
        <McpBand />

        <section>
          <SectionIntro title="Side by side">
            Facts from official docs and pricing pages, reviewed 20 October 2026. If a cell says
            unverified, we could not load a primary source.
          </SectionIntro>
          <CompareTable competitorName={competitor.shortName} rows={competitor.rows} />
        </section>

        <section className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="v2-h text-2xl">How {competitor.shortName} connects</h2>
            <p className="mt-3 text-[15px] leading-7 text-[var(--v2-muted)]">
              {competitor.howItConnects}
            </p>
            <p className="mt-4 text-[15px] leading-7 text-[var(--v2-muted)]">
              <span className="font-medium text-[var(--v2-fg)]">App code. </span>
              {competitor.codeChanges}
            </p>
          </div>
          <div>
            <h2 className="v2-h text-2xl">Discovery, environments, alerts, MCP</h2>
            <dl className="mt-3 space-y-4 text-[15px] leading-7 text-[var(--v2-muted)]">
              <div>
                <dt className="v2-mono text-[var(--v2-faint)]">Auto-discovery</dt>
                <dd className="mt-1">{competitor.autoDiscovery}</dd>
              </div>
              <div>
                <dt className="v2-mono text-[var(--v2-faint)]">Environments</dt>
                <dd className="mt-1">{competitor.multiEnv}</dd>
              </div>
              <div>
                <dt className="v2-mono text-[var(--v2-faint)]">Alerts</dt>
                <dd className="mt-1">{competitor.alerts}</dd>
              </div>
              <div>
                <dt className="v2-mono text-[var(--v2-faint)]">MCP</dt>
                <dd className="mt-1">{competitor.mcp}</dd>
              </div>
            </dl>
          </div>
        </section>

        {competitor.costs ? (
          <section>
            <SectionIntro title="Published cost at volume">
              {competitor.shortName} list prices. Durabull hosted is free to start. Your Redis and
              workers are separate and already yours.
            </SectionIntro>
            <CostTable caption={competitor.costs.caption} rows={competitor.costs.rows} />
          </section>
        ) : (
          <section>
            <h2 className="v2-h text-2xl">Pricing and license</h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[var(--v2-muted)]">
              {competitor.pricing}
            </p>
            <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[var(--v2-muted)]">
              {competitor.license}
            </p>
          </section>
        )}

        <section className="grid gap-10 lg:grid-cols-2">
          <div className="border border-[var(--v2-line)] p-6">
            <p className="v2-mono text-[var(--v2-faint)]">When to choose {competitor.shortName}</p>
            <p className="mt-3 text-[15px] leading-7 text-[var(--v2-muted)]">
              {competitor.whenToChooseThem}
            </p>
          </div>
          <div className="border border-[var(--v2-line)] p-6">
            <p className="v2-mono text-[var(--v2-accent)]">When to choose Durabull</p>
            <p className="mt-3 text-[15px] leading-7 text-[var(--v2-muted)]">
              {competitor.whenToChooseDurabull}
            </p>
          </div>
        </section>

        <section>
          <SectionIntro title="Questions people ask" />
          <CompareFaqList faqs={competitor.faqs} />
        </section>

        {related.length > 0 ? (
          <section>
            <SectionIntro title="Related comparisons" />
            <RelatedLinks items={related} />
          </section>
        ) : null}

        {relatedArticles.length > 0 ? (
          <section>
            <SectionIntro title="Guides" />
            <ul className="space-y-3">
              {relatedArticles.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={articlePath(article.slug)}
                    className="text-[15px] font-medium text-[var(--v2-fg)] underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-accent)]"
                  >
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {competitor.alternativesPage ? (
          <p className="text-sm text-[var(--v2-muted)]">
            Looking for a list?{' '}
            <Link
              href={`/alternatives/${competitor.slug}`}
              className="font-medium text-[var(--v2-fg)] underline underline-offset-4"
            >
              {competitor.shortName} alternatives
            </Link>
          </p>
        ) : null}

        <section>
          <SectionIntro title="Sources">
            Official pages visited for this comparison. Re-check prices on the day you buy.
          </SectionIntro>
          <SourceList sources={competitor.sources} />
        </section>
      </div>

      <CompareCta />
    </SiteLayout>
  )
}

import Link from 'next/link'
import { SiteLayout } from '@/components/v2/site-layout'
import { articlePath, articles } from '@/lib/compare/articles'
import { relatedCompetitors } from '@/lib/compare/catalog'
import { categoryLabels } from '@/lib/compare/editorial'
import type { Competitor } from '@/lib/compare/types'
import { SITE_URL } from '@/lib/config'
import { createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { CompareTable, CostTable } from './compare-table'
import {
  ArchitectureDiagram,
  DecisionSummary,
  EditorialHero,
  InlineText,
  ResearchNote,
} from './editorial'
import { CompareFaqList } from './faq-list'
import { JsonLd } from './json-ld'
import { CompareCta, McpBand, RelatedLinks, SectionIntro, SourceList } from './prose-blocks'

export function VsPage({ competitor: c }: { competitor: Competitor }) {
  const related = relatedCompetitors(c.slug)
  const relatedArticles = articles.filter((article) => article.relatedCompare.includes(c.slug))
  return (
    <SiteLayout>
      <JsonLd
        data={[
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Compare', url: `${SITE_URL}/compare/` },
            { name: c.name, url: `${SITE_URL}/compare/${c.slug}/` },
          ]),
          createFAQSchema(c.faqs),
        ]}
      />
      <EditorialHero
        eyebrow={categoryLabels[c.category]}
        title={`Durabull vs ${c.name}`}
        description={c.intro}
        visual={<ArchitectureDiagram category={c.category} />}
      >
        <div className="editorial-meta">
          <a href={c.website}>{c.name} website ↗</a>
          <span>{c.sources.length} primary references</span>
          {c.discontinued ? <span>Discontinued service</span> : null}
        </div>
      </EditorialHero>
      <div className="editorial-shell pb-16">
        <ResearchNote limited={c.researchStatus === 'limited'} />
        <nav aria-label="On this page" className="editorial-jump">
          <a href="#decision">Quick decision</a>
          <a href="#comparison">Feature comparison</a>
          <a href="#integration">Integration</a>
          <a href="#pricing">Pricing & license</a>
          <a href="#faq">FAQ</a>
          <a href="#sources">Sources</a>
        </nav>
        <section id="decision" className="editorial-section">
          <DecisionSummary
            name={c.shortName}
            theirs={c.whenToChooseThem}
            ours={c.whenToChooseDurabull}
          />
        </section>
        <section id="comparison" className="editorial-section">
          <SectionIntro label="Capabilities" title="The details that change the decision">
            Compare the documented deployment modes. “Not documented” means we did not find a vendor
            claim, not proof that a capability is impossible.{' '}
            <a className="underline underline-offset-4" href="#sources">
              Check the primary sources.
            </a>
          </SectionIntro>
          <CompareTable competitorName={c.shortName} rows={c.rows} />
        </section>
        <section id="integration" className="editorial-section grid gap-12 lg:grid-cols-2">
          <div>
            <SectionIntro label="Setup" title={`How ${c.shortName} connects`} />
            <p className="text-[15px] leading-7 text-[var(--v2-muted)]">
              <InlineText text={c.howItConnects} />
            </p>
            <p className="mt-5 text-[15px] leading-7 text-[var(--v2-muted)]">
              <strong className="text-[var(--v2-fg)]">Application changes. </strong>
              <InlineText text={c.codeChanges} />
            </p>
          </div>
          <dl className="space-y-6">
            {[
              { label: 'Queue discovery', text: c.autoDiscovery },
              { label: 'Environments', text: c.multiEnv },
              { label: 'Alerts', text: c.alerts },
              { label: 'AI & MCP', text: c.mcp },
            ].map(({ label, text }) => (
              <div key={label}>
                <dt className="editorial-eyebrow">{label}</dt>
                <dd className="mt-2 text-[15px] leading-7 text-[var(--v2-muted)]">
                  <InlineText text={text} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section id="pricing" className="editorial-section">
          <SectionIntro label="Economics" title="Understand what you are paying for" />
          <div className="editorial-pricing-note">
            <strong>Different products, different cost boundaries.</strong> Durabull’s hosted beta
            fee covers its dashboard. Redis, worker compute, storage, networking, and operational
            work remain yours. A runtime’s usage charges may cover orchestration or compute. The
            amounts below are not a total-cost or savings benchmark.
          </div>
          <p className="mb-4 max-w-4xl text-[15px] leading-7 text-[var(--v2-muted)]">
            <InlineText text={c.pricing} />
          </p>
          <p className="mb-6 max-w-4xl text-[15px] leading-7 text-[var(--v2-muted)]">
            <InlineText text={c.license} />
          </p>
          {c.costs ? <CostTable caption={c.costs.caption} rows={c.costs.rows} /> : null}
        </section>
        <section id="faq" className="editorial-section">
          <SectionIntro title={`Questions about ${c.shortName} and Durabull`} />
          <CompareFaqList faqs={c.faqs} />
        </section>
        <section id="sources" className="editorial-section">
          <SectionIntro label="Evidence" title="Sources & methodology">
            Reviewed against vendor documentation, public pricing, and source repositories. This is
            a documentation comparison, not a hands-on benchmark. Vendor docs may describe different
            editions or deployment modes; confirm those details before purchasing.
          </SectionIntro>
          <SourceList sources={c.sources} />
          <p className="mt-6 text-sm text-[var(--v2-muted)]">
            Durabull details:{' '}
            <Link href="/documentation" className="underline underline-offset-4">
              product documentation
            </Link>
            ,{' '}
            <Link href="/pricing" className="underline underline-offset-4">
              beta pricing
            </Link>
            , and{' '}
            <Link
              href="/documentation/integrations/mcp-server"
              className="underline underline-offset-4"
            >
              MCP reference
            </Link>
            . Found a change?{' '}
            <a href="mailto:hello@durabull.io" className="underline underline-offset-4">
              Send a correction.
            </a>
          </p>
        </section>
        <section className="editorial-section">
          <McpBand />
        </section>
        {related.length ? (
          <section className="editorial-section">
            <SectionIntro title="Continue your research" />
            <RelatedLinks items={related} />
          </section>
        ) : null}
        {relatedArticles.length ? (
          <section className="editorial-section">
            <SectionIntro title="Practical guides" />
            <ul className="space-y-3">
              {relatedArticles.map((article) => (
                <li key={article.slug}>
                  <Link
                    className="text-sm underline underline-offset-4"
                    href={articlePath(article.slug)}
                  >
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {c.alternativesPage ? (
          <p className="mt-8 text-sm">
            <Link className="underline underline-offset-4" href={`/alternatives/${c.slug}`}>
              Explore {c.shortName} alternatives →
            </Link>
          </p>
        ) : null}
      </div>
      <CompareCta />
    </SiteLayout>
  )
}

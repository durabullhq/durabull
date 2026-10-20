import Link from 'next/link'
import { SiteLayout } from '@/components/v2/site-layout'
import { articles } from '@/lib/compare/articles'
import { categoryOrder, competitors } from '@/lib/compare/catalog'
import { SITE_URL } from '@/lib/config'
import { createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { ComparisonDirectory } from './directory'
import { ArchitectureDiagram, CategoryChoices, EditorialHero, ResearchNote } from './editorial'
import { CompareFaqList } from './faq-list'
import { GuideCard } from './guide-card'
import { JsonLd } from './json-ld'
import { CompareCta } from './prose-blocks'

const hubFaqs = [
  {
    question: 'Which BullMQ dashboard should I choose?',
    answer:
      'Choose by deployment and operational needs. Bull Board and Workbench offer embedded interfaces. Durabull and Taskforce.sh offer Redis-connected operations with discovery, team workflows, and MCP. Check backend support, alert delivery, permissions, and pricing against your own environment.',
  },
  {
    question: 'Is Durabull a Bull Board alternative?',
    answer:
      'Yes, for Redis-backed BullMQ operations. Durabull connects to Redis without mounting a route in your application. Bull Board offers embedded and standalone modes, including CLI discovery. Compare those modes separately rather than assuming an embedded UI is the only option.',
  },
  {
    question: 'Can Durabull replace Inngest, Trigger.dev, or Temporal?',
    answer:
      'Durabull manages existing Redis-backed BullMQ queues. These other products provide execution or orchestration runtimes. Replacing a runtime means changing application code and infrastructure; adding a dashboard does not provide workflow compatibility.',
  },
  {
    question: 'How are these comparisons researched?',
    answer:
      'Durabull publishes these comparisons using vendor documentation, pricing pages, repositories, and its own source code. We distinguish documented capabilities from unverified details and list source links on every comparison. This is a documentation review, not a performance benchmark.',
  },
]
export function CompareHubPage() {
  return (
    <SiteLayout>
      <JsonLd
        data={[
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Compare', url: `${SITE_URL}/compare/` },
          ]),
          createFAQSchema(hubFaqs),
        ]}
      />
      <EditorialHero
        eyebrow="The queue tooling field guide"
        title="The right tool for the work ahead."
        description="Dashboards, runtimes, and observability solve different problems. Find your category, understand the tradeoffs, and choose with evidence."
        visual={<ArchitectureDiagram />}
      >
        <div className="editorial-meta">
          <span>{competitors.length} tools examined</span>
          <span>3 distinct categories</span>
          <a href="#directory">Find your comparison ↓</a>
        </div>
      </EditorialHero>
      <div className="editorial-shell pb-16">
        <ResearchNote />
        <CategoryChoices />
        <div id="directory">
          <ComparisonDirectory
            items={competitors.map(
              ({ slug, name, oneLiner, category, discontinued, researchStatus }) => ({
                slug,
                name,
                oneLiner,
                category,
                discontinued,
                researchStatus,
              })
            )}
            categories={categoryOrder}
          />
        </div>
        <section className="editorial-section">
          <div className="editorial-section-head">
            <div>
              <span className="editorial-eyebrow">Go deeper</span>
              <h2 className="mt-3">Field notes for production.</h2>
              <p>Practical guides to monitoring, recovery, and the economics of background work.</p>
            </div>
            <Link href="/blog" className="text-sm underline underline-offset-4">
              All guides →
            </Link>
          </div>
          <div className="guide-grid">
            {articles.slice(0, 3).map((article, index) => (
              <GuideCard key={article.slug} article={article} index={index} />
            ))}
          </div>
        </section>
        <section className="editorial-section">
          <h2 className="mb-8">Before you choose</h2>
          <CompareFaqList faqs={hubFaqs} />
        </section>
        <section id="sources" className="editorial-section">
          <h2>How we compare</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--v2-muted)]">
            We make Durabull, so this guide has a point of view. Our method is to examine official
            documentation and source code, distinguish deployment modes, disclose unknowns, and
            explain when another tool is the better fit. Each detail page links its primary sources.
            Prices are snapshots, not quotes; we do not present dashboard fees as total
            infrastructure costs or claim benchmark results we have not measured.
          </p>
          <p className="mt-4 text-sm">
            <a className="underline underline-offset-4" href="mailto:hello@durabull.io">
              Send a correction
            </a>
          </p>
        </section>
      </div>
      <CompareCta />
    </SiteLayout>
  )
}

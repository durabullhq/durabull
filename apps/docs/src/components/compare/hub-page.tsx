import Link from 'next/link'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { articles, articlePath } from '@/lib/compare/articles'
import { categoryOrder, competitorsInCategory } from '@/lib/compare/catalog'
import { SITE_URL } from '@/lib/config'
import { createBreadcrumbSchema, createFAQSchema, createSoftwareApplicationSchema } from '@/lib/seo'
import { CompareFaqList } from './faq-list'
import { JsonLd } from './json-ld'
import { CompareCta, McpBand } from './prose-blocks'

const hubFaqs = [
  {
    question: 'What is the best BullMQ dashboard?',
    answer:
      'If you want Redis auto-discovery, multiple environments, and an MCP server, Durabull or Taskforce.sh. If you want a free embed in a Node app, Bull Board or Workbench. Redis Insight is not a BullMQ dashboard.',
  },
  {
    question: 'Is Durabull a Bull Board alternative?',
    answer:
      'Yes. Bull Board embed registers queues in application code. Durabull scans Redis, so workers do not change for inspection.',
  },
  {
    question: 'Does Durabull replace Inngest or Trigger.dev?',
    answer:
      'No. Those platforms replace the queue runtime and bill per execution or compute. Durabull monitors BullMQ on Redis you already run.',
  },
  {
    question: 'Who else has a BullMQ MCP?',
    answer:
      'Taskforce.sh (hosted), Workbench (local proxy), and Bullpane Pro. APM vendors have telemetry MCPs. They do not retry BullMQ jobs.',
  },
]

export function CompareHubPage() {
  return (
    <SiteLayout>
      <JsonLd
        data={[
          createSoftwareApplicationSchema(),
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Compare', url: `${SITE_URL}/compare` },
          ]),
          createFAQSchema(hubFaqs),
        ]}
      />

      <PageHeading label="Compare" title="Durabull versus the rest of the queue shelf.">
        <p>
          Fair, sourced comparisons. BullMQ UIs, managed job platforms, and generic observability.
          Durabull MCP is the difference when the question is “can my agent operate the queue?”
        </p>
      </PageHeading>

      <div className="mx-auto max-w-7xl space-y-16 px-5 py-14 sm:px-8 sm:py-20">
        <McpBand />

        {categoryOrder.map((category) => {
          const items = competitorsInCategory(category.id)
          return (
            <section key={category.id}>
              <p className="v2-mono text-[var(--v2-accent)]">{category.label}</p>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--v2-muted)]">
                {category.blurb}
              </p>
              <ul className="mt-8 divide-y divide-[var(--v2-line)] border-y border-[var(--v2-line)]">
                {items.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/compare/${item.slug}`}
                      className="group grid gap-2 py-5 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-8"
                    >
                      <span className="v2-h text-lg group-hover:text-[var(--v2-accent)]">
                        {item.name}
                        {item.discontinued ? (
                          <span className="v2-mono ml-2 text-[10px] text-[var(--v2-faint)]">
                            Sunset
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[14.5px] leading-6 text-[var(--v2-muted)]">
                        {item.oneLiner}
                      </span>
                      <span className="v2-mono text-[var(--v2-faint)] group-hover:text-[var(--v2-accent)]">
                        vs Durabull
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <section>
          <p className="v2-mono text-[var(--v2-accent)]">Guides</p>
          <h2 className="v2-h mt-2 text-2xl sm:text-3xl">Long-form answers</h2>
          <ul className="mt-8 divide-y divide-[var(--v2-line)] border-y border-[var(--v2-line)]">
            {articles.map((article) => (
              <li key={article.slug} className="py-5">
                <Link
                  href={articlePath(article.slug)}
                  className="v2-h text-lg hover:text-[var(--v2-accent)]"
                >
                  {article.title}
                </Link>
                <p className="mt-2 max-w-3xl text-[14.5px] leading-6 text-[var(--v2-muted)]">
                  {article.description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="v2-h text-2xl sm:text-3xl">FAQ</h2>
          <div className="mt-8">
            <CompareFaqList faqs={hubFaqs} />
          </div>
        </section>
      </div>

      <CompareCta />
    </SiteLayout>
  )
}

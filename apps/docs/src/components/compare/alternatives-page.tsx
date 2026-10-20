import Link from 'next/link'
import { SiteLayout } from '@/components/v2/site-layout'
import { alternativesFor } from '@/lib/compare/catalog'
import { categoryLabels } from '@/lib/compare/editorial'
import type { Competitor } from '@/lib/compare/types'
import { SITE_URL } from '@/lib/config'
import { createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { ArchitectureDiagram, EditorialHero, InlineText, ResearchNote } from './editorial'
import { CompareFaqList } from './faq-list'
import { JsonLd } from './json-ld'
import { CompareCta, SectionIntro, SourceList } from './prose-blocks'

const shortlistNoun: Record<Competitor['category'], string> = {
  'bullmq-ui': 'BullMQ dashboards',
  'managed-platform': 'runtimes and workflow platforms',
  observability: 'observability platforms',
}

export function AlternativesPage({ competitor: c }: { competitor: Competitor }) {
  const peers = alternativesFor(c)
  const isDashboard = c.category === 'bullmq-ui'
  const title = c.alternativesTitle ?? `${c.name} alternatives`
  const faqs = [
    {
      question: `How should I choose a ${c.shortName} alternative?`,
      answer: isDashboard
        ? 'Start with your BullMQ backend and version, then compare deployment modes, discovery, permissions, recovery actions, and alert delivery. Validate the shortlist against a staging connection before changing your production dashboard.'
        : 'Start with the capability you need to replace. Compare products within the same runtime or observability category, then evaluate migration effort, failure behavior, billing units, and the operating work you retain.',
    },
    { question: `When should I keep ${c.shortName}?`, answer: c.whenToChooseThem },
    ...c.faqs.slice(0, 2),
  ]
  const criteria = isDashboard
    ? [
        [
          'Connection model',
          'Will you embed a route, run a standalone service, or use hosted access? Check private-network connectivity and supported Redis/BullMQ versions.',
        ],
        [
          'Daily operations',
          'Try discovery, failed-job inspection, retry, pause/resume, and a non-default queue prefix. Confirm what read-only users can see and do.',
        ],
        [
          'Team & AI access',
          'Test authentication, permission boundaries, redaction, and audit behavior. An MCP listing alone does not establish safe production write access.',
        ],
      ]
    : c.category === 'managed-platform'
      ? [
          [
            'Execution semantics',
            'Map retries, timeouts, concurrency, scheduling, durable waits, and idempotency to the alternative. A similar API name does not guarantee equivalent behavior.',
          ],
          [
            'Migration boundary',
            'Identify who runs the broker, scheduler, and worker compute. Test how in-flight work, event history, and external side effects will survive a cutover.',
          ],
          [
            'Actual bill',
            'Model runs, steps, retries, compute duration, storage, and support. Reconcile included usage and limits before comparing monthly totals.',
          ],
        ]
      : [
          [
            'Telemetry coverage',
            'Decide whether you need infrastructure metrics, distributed tracing, error grouping, or all three. Check Node.js integration and sampling behavior.',
          ],
          [
            'Retention & cardinality',
            'Model retention, hosts, users, and custom metrics. Avoid job IDs and payload fields as metric labels; inspect sensitive data handling.',
          ],
          [
            'Operational actions',
            'Check what happens after an alert. Your telemetry platform may still need a BullMQ dashboard to inspect, retry, or pause specific work.',
          ],
        ]
  return (
    <SiteLayout>
      <JsonLd
        data={[
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Compare', url: `${SITE_URL}/compare/` },
            { name: title, url: `${SITE_URL}/alternatives/${c.slug}/` },
          ]),
          createFAQSchema(faqs),
        ]}
      />
      <EditorialHero
        eyebrow={`${categoryLabels[c.category]} / Shortlist`}
        title={title}
        description={`Start with what you need to change about ${c.shortName}. This shortlist separates comparable tools from complementary ones, with decision criteria and official references.`}
        visual={<ArchitectureDiagram category={c.category} />}
      />
      <div className="editorial-shell pb-16">
        <ResearchNote />
        <section className="editorial-section">
          <SectionIntro title="Before you switch">{c.whenToChooseThem}</SectionIntro>
          <div className="category-choices !my-0">
            {criteria.map(([heading, body], index) => (
              <div key={heading} className="border-r border-[var(--v2-line)] p-7 last:border-r-0">
                <span className="editorial-eyebrow">0{index + 1} / Evaluate</span>
                <h3>{heading}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="editorial-section">
          <SectionIntro
            title={isDashboard ? 'Where Durabull fits' : 'Keeping BullMQ is a separate decision'}
          >
            {isDashboard
              ? 'For teams operating Redis-backed BullMQ across connections and environments.'
              : `Durabull is a dashboard for Redis-backed BullMQ. It does not implement ${c.shortName}’s runtime or telemetry features. Consider it when your underlying need is queue operations.`}
          </SectionIntro>
          <div className="editorial-pricing-note">
            <InlineText text={c.whenToChooseDurabull} />
            <p className="mt-4">
              <Link className="underline underline-offset-4" href={`/compare/${c.slug}`}>
                Read the full Durabull vs {c.shortName} comparison →
              </Link>
            </p>
          </div>
        </section>
        <section className="editorial-section">
          <SectionIntro
            label="Your shortlist"
            title={`Other ${shortlistNoun[c.category]} to evaluate`}
          >
            Related tools appear first. This is an editorial shortlist, not a performance ranking.
            Editions and deployment modes matter; follow each vendor reference before choosing.
          </SectionIntro>
          <ol className="space-y-8">
            {peers.map((item, index) => (
              <li
                key={item.slug}
                className="grid gap-4 border-t border-[var(--v2-line)] pt-7 md:grid-cols-[220px_1fr]"
              >
                <div>
                  <p className="editorial-eyebrow">
                    {String(index + 1).padStart(2, '0')} / {categoryLabels[item.category]}
                  </p>
                  <h3 className="v2-h mt-2 text-2xl">{item.name}</h3>
                </div>
                <div>
                  <p className="text-[15px] leading-7 text-[var(--v2-muted)]">
                    <InlineText text={item.whenToChooseThem} />
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--v2-muted)]">
                    <strong>Pricing model. </strong>
                    <InlineText text={item.pricing} />
                  </p>
                  <div className="mt-4 flex flex-wrap gap-5 text-xs">
                    <Link className="underline underline-offset-4" href={`/compare/${item.slug}`}>
                      Detailed comparison
                    </Link>
                    <a
                      className="underline underline-offset-4"
                      href={item.sources[0]?.url ?? item.website}
                    >
                      Official reference ↗
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="editorial-section">
          <SectionIntro title="Common questions" />
          <CompareFaqList faqs={faqs} />
        </section>
        <section id="sources" className="editorial-section">
          <SectionIntro title="Sources & methodology">
            The shortlist uses each product’s official documentation and public pricing. Vendor
            references are linked beside each entry; these sources establish the starting product’s
            capabilities. Published by Durabull; no hands-on benchmark or independent ranking is
            implied.
          </SectionIntro>
          <SourceList sources={c.sources} />
        </section>
      </div>
      <CompareCta />
    </SiteLayout>
  )
}

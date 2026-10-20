import Link from 'next/link'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import type { Article } from '@/lib/compare/types'
import { getCompetitor } from '@/lib/compare/catalog'
import { SITE_URL } from '@/lib/config'
import { createArticleSchema, createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { CompareFaqList } from './faq-list'
import { JsonLd } from './json-ld'
import { CompareCta, McpBand, SectionIntro } from './prose-blocks'

export function ArticlePage({ article }: { article: Article }) {
  const related = article.relatedCompare
    .map((slug) => getCompetitor(slug))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)

  return (
    <SiteLayout>
      <JsonLd
        data={[
          createArticleSchema({
            headline: article.title,
            description: article.description,
            url: `${SITE_URL}/blog/${article.slug}`,
            datePublished: article.datePublished,
          }),
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Blog', url: `${SITE_URL}/blog` },
            { name: article.title, url: `${SITE_URL}/blog/${article.slug}` },
          ]),
          createFAQSchema(article.faqs),
        ]}
      />

      <PageHeading label="Guide" title={article.title}>
        <p>{article.intro}</p>
        <p className="v2-mono mt-5 text-[var(--v2-faint)]">
          Published {article.datePublished} · Facts checked against official docs
        </p>
      </PageHeading>

      <article className="mx-auto max-w-7xl space-y-14 px-5 py-14 sm:px-8 sm:py-20">
        <McpBand />

        {article.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="v2-h text-2xl sm:text-3xl">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p
                key={paragraph.slice(0, 48)}
                className="mt-4 max-w-3xl text-[15px] leading-7 text-[var(--v2-muted)]"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section>
          <SectionIntro title="FAQ" />
          <CompareFaqList faqs={article.faqs} />
        </section>

        {related.length > 0 ? (
          <section>
            <SectionIntro title="Comparisons cited here" />
            <ul className="space-y-2">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/compare/${item.slug}`}
                    className="text-[15px] font-medium underline decoration-[var(--v2-line-strong)] underline-offset-4 hover:decoration-[var(--v2-accent)]"
                  >
                    Durabull vs {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <CompareCta />
    </SiteLayout>
  )
}

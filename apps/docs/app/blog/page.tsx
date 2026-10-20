import Link from 'next/link'
import { CompareCta } from '@/components/compare/prose-blocks'
import { PageHeading } from '@/components/v2/page-heading'
import { SiteLayout } from '@/components/v2/site-layout'
import { articlePath, articles } from '@/lib/compare/articles'
import { SITE_URL } from '@/lib/config'
import { createAbsoluteMetadata, createBreadcrumbSchema } from '@/lib/seo'
import { JsonLd } from '@/components/compare/json-ld'

export const metadata = createAbsoluteMetadata(
  {
    title: 'BullMQ monitoring guides',
    description:
      'How to monitor BullMQ, dashboard comparisons, MCP for AI agents, and managed-platform cost breakdowns from official 2026 pricing pages.',
    keywords: ['Durabull blog', 'BullMQ guides', 'BullMQ MCP', 'BullMQ dashboard'],
  },
  '/blog'
)

export default function BlogIndexPage() {
  return (
    <SiteLayout>
      <JsonLd
        data={createBreadcrumbSchema([
          { name: 'Home', url: SITE_URL },
          { name: 'Blog', url: `${SITE_URL}/blog` },
        ])}
      />
      <PageHeading label="Guides" title="How to operate BullMQ.">
        <p>
          Production monitoring, dashboard shortlists, MCP, and cost tables. Prices are copied from
          vendor pages dated 20 October 2026.
        </p>
      </PageHeading>
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <ul className="divide-y divide-[var(--v2-line)] border-y border-[var(--v2-line)]">
          {articles.map((article) => (
            <li key={article.slug} className="py-8">
              <p className="v2-mono text-[var(--v2-faint)]">{article.datePublished}</p>
              <Link
                href={articlePath(article.slug)}
                className="v2-h mt-2 block text-2xl hover:text-[var(--v2-accent)]"
              >
                {article.title}
              </Link>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[var(--v2-muted)]">
                {article.description}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-[var(--v2-muted)]">
          Also see the{' '}
          <Link href="/compare" className="font-medium underline underline-offset-4">
            comparison hub
          </Link>
          .
        </p>
      </section>
      <CompareCta />
    </SiteLayout>
  )
}

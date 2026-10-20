import { EditorialHero } from '@/components/compare/editorial'
import { GuideCard } from '@/components/compare/guide-card'
import { JsonLd } from '@/components/compare/json-ld'
import { CompareCta } from '@/components/compare/prose-blocks'
import { SiteLayout } from '@/components/v2/site-layout'
import { articles } from '@/lib/compare/articles'
import { editorialImagePath } from '@/lib/compare/editorial'
import { SITE_URL } from '@/lib/config'
import { createAbsoluteMetadata, createBreadcrumbSchema } from '@/lib/seo'

export const metadata = createAbsoluteMetadata(
  {
    title: 'BullMQ monitoring & background job guides',
    description:
      'Practical, sourced guides to BullMQ monitoring, safe job recovery, MCP, dashboard selection, and the real cost of managed background jobs.',
    ogImage: editorialImagePath('blog'),
  },
  '/blog'
)
export default function BlogIndexPage() {
  return (
    <SiteLayout>
      <JsonLd
        data={createBreadcrumbSchema([
          { name: 'Home', url: SITE_URL },
          { name: 'Guides', url: `${SITE_URL}/blog/` },
        ])}
      />
      <EditorialHero
        parent="blog"
        eyebrow="Durabull field guides"
        title="Background jobs. Foreground thinking."
        description="Make sense of the systems behind the work. Practical runbooks, architecture decisions, and cost models for teams running BullMQ in production."
      >
        <div className="editorial-meta">
          <span>Written by Durabull</span>
          <span>Primary sources linked throughout</span>
        </div>
      </EditorialHero>
      <section className="editorial-shell py-12 sm:py-16" aria-label="BullMQ guides">
        <GuideCard article={articles[0]} featured />
        <div className="guide-grid">
          {articles.slice(1).map((article, index) => (
            <GuideCard key={article.slug} article={article} index={index + 1} />
          ))}
        </div>
      </section>
      <CompareCta />
    </SiteLayout>
  )
}

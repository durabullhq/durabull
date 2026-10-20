import Link from 'next/link'
import { SiteLayout } from '@/components/v2/site-layout'
import { articles } from '@/lib/compare/articles'
import { getCompetitor } from '@/lib/compare/catalog'
import { editorialImagePath, formatDate, readingMinutes, sectionId } from '@/lib/compare/editorial'
import type { Article } from '@/lib/compare/types'
import { SITE_URL } from '@/lib/config'
import { createArticleSchema, createBreadcrumbSchema, createFAQSchema } from '@/lib/seo'
import { ArticleVisual } from './article-visual'
import { EditorialHero, InlineText, SourceReference } from './editorial'
import { CompareFaqList } from './faq-list'
import { GuideCard } from './guide-card'
import { JsonLd } from './json-ld'
import { CompareCta, RelatedLinks, SourceList } from './prose-blocks'

export function ArticlePage({ article }: { article: Article }) {
  const related = article.relatedCompare
    .map(getCompetitor)
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
  const nextArticles = articles
    .filter((item) => item.slug !== article.slug)
    .sort(
      (a, b) => Number(b.category === article.category) - Number(a.category === article.category)
    )
    .slice(0, 3)
  return (
    <SiteLayout>
      <JsonLd
        data={[
          createArticleSchema({
            headline: article.title,
            description: article.description,
            url: `${SITE_URL}/blog/${article.slug}/`,
            datePublished: article.datePublished,
            dateModified: article.dateModified,
            image: `${SITE_URL}${editorialImagePath('blog', article.slug)}`,
            sources: article.sources.map((s) => s.url),
          }),
          createBreadcrumbSchema([
            { name: 'Home', url: SITE_URL },
            { name: 'Guides', url: `${SITE_URL}/blog/` },
            { name: article.title, url: `${SITE_URL}/blog/${article.slug}/` },
          ]),
          createFAQSchema(article.faqs),
        ]}
      />
      <EditorialHero
        parent="blog"
        eyebrow={`${article.category} / Field guide`}
        title={article.title}
        description={article.intro}
      >
        <div className="editorial-meta">
          <Link href="/about">By Durabull</Link>
          <span>
            Published{' '}
            <time dateTime={article.datePublished}>{formatDate(article.datePublished)}</time>
          </span>
          {article.dateModified && article.dateModified !== article.datePublished ? (
            <span>
              Updated{' '}
              <time dateTime={article.dateModified}>{formatDate(article.dateModified)}</time>
            </span>
          ) : null}
          <span>{readingMinutes(article)} min read</span>
          <a href="#sources">{article.sources.length} primary sources</a>
        </div>
      </EditorialHero>
      <div className="editorial-shell editorial-content">
        <nav aria-label="Article contents" className="editorial-toc">
          <span className="editorial-eyebrow">In this guide</span>
          <ol>
            <li>
              <a href="#takeaway">The short answer</a>
            </li>
            {article.sections.map((section) => (
              <li key={section.heading}>
                <a href={`#${sectionId(section.heading)}`}>{section.heading}</a>
              </li>
            ))}
            <li>
              <a href="#faq">Common questions</a>
            </li>
            <li>
              <a href="#sources">Sources & review</a>
            </li>
          </ol>
        </nav>
        <article className="editorial-article">
          <section id="takeaway" className="article-takeaway">
            <span className="editorial-eyebrow">The short answer</span>
            <p>
              <InlineText text={article.takeaway} />
            </p>
          </section>
          <ArticleVisual slug={article.slug} />
          {article.sections.map((section) => (
            <section id={sectionId(section.heading)} key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>
                  <InlineText text={paragraph} />
                </p>
              ))}
              {section.code ? (
                <figure>
                  {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Code overflow must be keyboard-scrollable. */}
                  <pre tabIndex={0}>
                    <code>{section.code.value}</code>
                  </pre>
                  {section.code.caption ? (
                    <figcaption className="code-caption text-[var(--v2-muted)]">
                      {section.code.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}
              {section.sourceUrls?.length ? (
                <nav className="section-sources" aria-label={`Sources for ${section.heading}`}>
                  {section.sourceUrls.map((url) => (
                    <SourceReference
                      key={url}
                      url={url}
                      label={
                        article.sources.find((source) => source.url === url)?.label ??
                        new URL(url).hostname
                      }
                    />
                  ))}
                </nav>
              ) : null}
            </section>
          ))}
          <section id="faq">
            <h2 className="mb-8">Common questions</h2>
            <CompareFaqList faqs={article.faqs} />
          </section>
          <section id="sources">
            <h2>Sources & review</h2>
            <p>
              Written by Durabull. Reviewed{' '}
              <time dateTime={article.dateModified ?? article.datePublished}>
                {formatDate(article.dateModified ?? article.datePublished)}
              </time>{' '}
              against the references below and Durabull’s implementation. Pricing examples are
              documented models, not measured benchmarks or vendor quotes.
            </p>
            <div className="mt-6">
              <SourceList sources={article.sources} />
            </div>
            <p>
              <a href="mailto:hello@durabull.io" className="underline underline-offset-4">
                Suggest a correction
              </a>{' '}
              if a feature, price, or documented behavior has changed.
            </p>
          </section>
          {related.length ? (
            <section>
              <h2 className="mb-6">Compare the options</h2>
              <RelatedLinks items={related} />
            </section>
          ) : null}
        </article>
      </div>
      <section className="editorial-shell pb-16">
        <h2 className="v2-h mb-8 text-3xl">Keep reading</h2>
        <div className="guide-grid">
          {nextArticles.map((item, index) => (
            <GuideCard key={item.slug} article={item} index={index + 1} headingLevel={3} />
          ))}
        </div>
      </section>
      <CompareCta />
    </SiteLayout>
  )
}

import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { articlePath } from '@/lib/compare/articles'
import { readingMinutes } from '@/lib/compare/editorial'
import type { Article } from '@/lib/compare/types'
import { ArticleArt } from './editorial'

export function GuideCard({
  article,
  index = 0,
  featured = false,
}: {
  article: Article
  index?: number
  featured?: boolean
}) {
  return (
    <Link href={articlePath(article.slug)} className={featured ? 'featured-guide' : 'guide-card'}>
      <ArticleArt variant={index} />
      <div className="guide-card-content">
        <span className="editorial-eyebrow">
          {featured ? 'Start here / ' : ''}
          {article.category}
        </span>
        <h2>{article.title}</h2>
        <p>{article.description}</p>
        <span className="guide-card-meta">
          <span>
            {readingMinutes(article)} min read · {article.sources?.length ?? 0} sources
          </span>
          <ArrowUpRight size={16} aria-hidden />
        </span>
      </div>
    </Link>
  )
}

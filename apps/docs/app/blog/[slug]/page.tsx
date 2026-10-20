import { notFound } from 'next/navigation'
import { ArticlePage } from '@/components/compare/article-page'
import { articles, getArticle } from '@/lib/compare/articles'
import { createAbsoluteMetadata } from '@/lib/seo'

export function generateStaticParams() {
  return articles.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) return {}
  return createAbsoluteMetadata(
    {
      title: article.title,
      description: article.description,
      keywords: article.keywords,
      ogType: 'article',
    },
    `/blog/${article.slug}`
  )
}

export default async function BlogSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle(slug)
  if (!article) notFound()
  return <ArticlePage article={article} />
}

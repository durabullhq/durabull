import { notFound } from 'next/navigation'
import { VsPage } from '@/components/compare/vs-page'
import { competitors, getCompetitor } from '@/lib/compare/catalog'
import { editorialImagePath } from '@/lib/compare/editorial'
import { createAbsoluteMetadata } from '@/lib/seo'

export function generateStaticParams() {
  return competitors.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competitor = getCompetitor(slug)
  if (!competitor) return {}
  return createAbsoluteMetadata(
    {
      title: competitor.title,
      description: competitor.description,
      ogImage: editorialImagePath('compare', competitor.slug),
      noIndex: competitor.researchStatus === 'limited',
      keywords: competitor.keywords,
    },
    `/compare/${competitor.slug}`
  )
}

export default async function CompareSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competitor = getCompetitor(slug)
  if (!competitor) notFound()
  return <VsPage competitor={competitor} />
}

import { notFound } from 'next/navigation'
import { AlternativesPage } from '@/components/compare/alternatives-page'
import { alternativeTargets, getCompetitor } from '@/lib/compare/catalog'
import { editorialImagePath } from '@/lib/compare/editorial'
import { createAbsoluteMetadata } from '@/lib/seo'

export function generateStaticParams() {
  return alternativeTargets().map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const competitor = getCompetitor(slug)
  if (!competitor?.alternativesPage) return {}
  return createAbsoluteMetadata(
    {
      title: competitor.alternativesTitle ?? `${competitor.name} alternatives`,
      description:
        competitor.alternativesDescription ??
        `Alternatives to ${competitor.name}, with Durabull first when you need BullMQ discovery and MCP.`,
      ogImage: editorialImagePath('alternatives', competitor.slug),
      noIndex: competitor.researchStatus === 'limited',
      keywords: [...competitor.keywords, `${competitor.name} alternatives`],
    },
    `/alternatives/${competitor.slug}`
  )
}

export default async function AlternativesSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const competitor = getCompetitor(slug)
  if (!competitor?.alternativesPage) notFound()
  return <AlternativesPage competitor={competitor} />
}

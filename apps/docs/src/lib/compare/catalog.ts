import { observabilityCompetitors } from './observability'
import { platformCompetitors } from './platforms'
import type { Competitor, CompetitorCategory } from './types'
import { uiCompetitors } from './uis'

export const competitors: Competitor[] = [
  ...uiCompetitors,
  ...platformCompetitors,
  ...observabilityCompetitors,
]

const bySlug = new Map(competitors.map((item) => [item.slug, item]))

export const categoryOrder: Array<{ id: CompetitorCategory; label: string; blurb: string }> = [
  {
    id: 'bullmq-ui',
    label: 'BullMQ and Redis dashboards',
    blurb:
      'Embedded interfaces, standalone dashboards, and Redis tools. Compare deployment modes, discovery, job operations, and team access.',
  },
  {
    id: 'managed-platform',
    label: 'Job runtimes and workflow platforms',
    blurb:
      'Systems that execute or orchestrate background work. Some are managed services; others are self-hosted libraries. Compare their execution models and billing units.',
  },
  {
    id: 'observability',
    label: 'Observability platforms',
    blurb:
      'Metrics, traces, logs, and error tracking. These can complement a queue dashboard when you need to connect job failures to wider system behavior.',
  },
]

export function getCompetitor(slug: string): Competitor | undefined {
  return bySlug.get(slug)
}

export function competitorsInCategory(category: CompetitorCategory): Competitor[] {
  return competitors.filter((item) => item.category === category)
}

export function featuredCompetitors(): Competitor[] {
  return competitors.filter((item) => item.featured)
}

export function alternativeTargets(): Competitor[] {
  return competitors.filter((item) => item.alternativesPage)
}

export function relatedCompetitors(slug: string): Competitor[] {
  const current = bySlug.get(slug)
  if (!current) return []
  return current.related
    .map((relatedSlug) => bySlug.get(relatedSlug))
    .filter((item): item is Competitor => item !== undefined)
}

export function comparePath(slug: string): string {
  return `/compare/${slug}`
}

export function alternativesPath(slug: string): string {
  return `/alternatives/${slug}`
}

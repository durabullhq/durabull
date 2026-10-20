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
      'UIs that sit beside Bull, BullMQ, or Redis. This is the like-for-like set: discovery, environments, alerts, MCP.',
  },
  {
    id: 'managed-platform',
    label: 'Managed job and workflow platforms',
    blurb:
      'These replace Redis + BullMQ. They do not monitor your existing queues. Costs are their published meters, not Durabull’s.',
  },
  {
    id: 'observability',
    label: 'Generic observability',
    blurb:
      'APM and metrics stacks teams already pay for. They watch Redis or traces. They do not publish job retry consoles.',
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

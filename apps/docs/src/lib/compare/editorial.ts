import type { Article, CompetitorCategory } from './types'

export const REVIEWED_DATE = '2026-10-20'
export const REVIEWED_LABEL = '20 October 2026'
export const categoryLabels: Record<CompetitorCategory, string> = {
  'bullmq-ui': 'BullMQ & Redis tools',
  'managed-platform': 'Runtimes & workflows',
  observability: 'Observability',
}

export function sectionId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function readingMinutes(article: Article): number {
  const words = [
    article.intro,
    article.takeaway,
    ...article.sections.flatMap((s) => s.body),
    ...article.faqs.map((faq) => `${faq.question} ${faq.answer}`),
  ]
    .join(' ')
    .split(/\s+/).length
  return Math.max(1, Math.ceil(words / 220))
}

export function editorialImagePath(
  kind: 'blog' | 'compare' | 'alternatives',
  slug?: string
): string {
  return `/images/editorial/${kind}${slug ? `-${slug}` : ''}.png`
}

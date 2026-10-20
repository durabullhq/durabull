export type CompetitorCategory = 'bullmq-ui' | 'managed-platform' | 'observability'

export interface ComparisonRow {
  feature: string
  durabull: string
  competitor: string
}

export interface CostRow {
  volume: string
  competitor: string
  durabull: string
  unit: string
}

export interface SourceLink {
  label: string
  url: string
}

export interface FaqItem {
  question: string
  answer: string
}

export interface Competitor {
  slug: string
  name: string
  shortName: string
  website: string
  category: CompetitorCategory
  /** Hub card one-liner */
  oneLiner: string
  /** Contextual tool, not a replacement for products in this category. */
  complementary?: boolean
  featured: boolean
  alternativesPage: boolean
  discontinued?: boolean
  unverifiedLiveSite?: boolean
  researchStatus?: 'limited'
  title: string
  description: string
  keywords: string[]
  alternativesTitle?: string
  alternativesDescription?: string
  intro: string
  howItConnects: string
  codeChanges: string
  autoDiscovery: string
  multiEnv: string
  alerts: string
  mcp: string
  pricing: string
  license: string
  whenToChooseThem: string
  whenToChooseDurabull: string
  rows: ComparisonRow[]
  costs?: {
    caption: string
    rows: CostRow[]
  }
  faqs: FaqItem[]
  sources: SourceLink[]
  related: string[]
}

export interface ArticleSection {
  heading: string
  body: string[]
  sourceUrls?: string[]
  code?: { language: string; value: string; caption?: string }
}

export interface Article {
  slug: string
  title: string
  description: string
  keywords: string[]
  category: string
  takeaway: string
  sources: SourceLink[]
  dateModified?: string
  datePublished: string
  intro: string
  sections: ArticleSection[]
  faqs: FaqItem[]
  relatedCompare: string[]
}

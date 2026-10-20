import { describe, expect, test } from 'bun:test'
import { articles } from './articles'
import {
  alternativesFor,
  alternativeTargets,
  competitors,
  getCompetitor,
  relatedCompetitors,
} from './catalog'

describe('comparison catalog', () => {
  test('has unique slugs, titles, and descriptions', () => {
    const slugs = competitors.map((item) => item.slug)
    const titles = competitors.map((item) => item.title)
    const descriptions = competitors.map((item) => item.description)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  test('every competitor has sources, FAQs, and when-to-choose notes', () => {
    for (const item of competitors) {
      expect(item.sources.length).toBeGreaterThan(0)
      expect(item.faqs.length).toBeGreaterThan(0)
      expect(item.whenToChooseThem.length).toBeGreaterThan(20)
      expect(item.whenToChooseDurabull.length).toBeGreaterThan(20)
      expect(item.rows.length).toBeGreaterThan(1)
      for (const source of item.sources) {
        expect(source.url.startsWith('http')).toBe(true)
      }
    }
  })

  test('related slugs resolve', () => {
    for (const item of competitors) {
      expect(relatedCompetitors(item.slug).length).toBe(item.related.length)
    }
  })

  test('looks up known slugs', () => {
    expect(getCompetitor('bull-board')?.name).toBe('Bull Board')
    expect(getCompetitor('missing')).toBeUndefined()
  })

  test('alternatives pages exist for the largest names', () => {
    const slugs = alternativeTargets().map((item) => item.slug)
    expect(slugs).toContain('bull-board')
    expect(slugs).toContain('taskforce')
    expect(slugs).toContain('inngest')
    expect(slugs).toContain('trigger-dev')
  })
})

describe('guide articles', () => {
  test('have unique slugs and titles', () => {
    const slugs = articles.map((item) => item.slug)
    const titles = articles.map((item) => item.title)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(titles).size).toBe(titles.length)
    expect(articles.length).toBeGreaterThanOrEqual(8)
  })

  test('related compare slugs exist', () => {
    for (const article of articles) {
      for (const slug of article.relatedCompare) {
        expect(getCompetitor(slug)).toBeDefined()
      }
    }
  })
})

describe('editorial evidence', () => {
  test('every guide section links to its declared sources', () => {
    for (const article of articles) {
      const sources = new Set(article.sources.map((source) => source.url))
      expect(sources.size).toBe(article.sources.length)
      expect(article.takeaway.length).toBeGreaterThan(40)
      for (const section of article.sections) {
        expect(section.sourceUrls?.length).toBeGreaterThan(0)
        for (const url of section.sourceUrls ?? []) expect(sources.has(url)).toBe(true)
      }
    }
  })
})

test('dashboard replacement shortlists exclude libraries and database browsers', () => {
  for (const target of alternativeTargets().filter((item) => item.category === 'bullmq-ui')) {
    const slugs = alternativesFor(target).map((item) => item.slug)
    expect(slugs).not.toContain('bullmq-pro')
    expect(slugs).not.toContain('redis-insight')
    expect(slugs).not.toContain('upqueue')
    expect(slugs).not.toContain(target.slug)
  }
})

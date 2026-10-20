'use client'

import { ArrowUpRight, Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { Competitor, CompetitorCategory } from '@/lib/compare/types'

type DirectoryItem = Pick<
  Competitor,
  'slug' | 'name' | 'oneLiner' | 'category' | 'discontinued' | 'researchStatus'
>
export function ComparisonDirectory({
  items,
  categories,
}: {
  items: DirectoryItem[]
  categories: { id: CompetitorCategory; label: string; blurb: string }[]
}) {
  const [query, setQuery] = useState('')
  const filtered = items.filter((item) =>
    `${item.name} ${item.oneLiner}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  return (
    <div>
      <div className="directory-search">
        <Search size={18} aria-hidden />
        <label htmlFor="compare-search" className="sr-only">
          Find a tool
        </label>
        <input
          id="compare-search"
          type="search"
          placeholder="Find a tool, e.g. Bull Board or Temporal"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <output className="directory-results" aria-live="polite">
        {filtered.length} of {items.length} tools
        {query ? ` matching “${query}”` : ' · grouped by the job they do'}
      </output>
      {categories.map((category) => {
        const matches = filtered.filter((item) => item.category === category.id)
        if (!matches.length) return null
        return (
          <section key={category.id} id={category.id} className="editorial-section">
            <div className="editorial-section-head">
              <div>
                <h2>{category.label}</h2>
                <p>{category.blurb}</p>
              </div>
              <span className="editorial-count">
                {String(matches.length).padStart(2, '0')} tools
              </span>
            </div>
            <ul className="directory-list">
              {matches.map((item) => (
                <li key={item.slug}>
                  <Link href={`/compare/${item.slug}`}>
                    <h3>
                      {item.name}
                      {item.researchStatus === 'limited' ? (
                        <span className="editorial-badge">Limited evidence</span>
                      ) : item.discontinued ? (
                        <span className="editorial-badge">Sunset</span>
                      ) : null}
                    </h3>
                    <p>{item.oneLiner}</p>
                    <ArrowUpRight size={18} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {!filtered.length ? (
        <p className="py-10 text-sm text-[var(--v2-muted)]">
          No tools match that search. Try a product name or clear the search to see every
          comparison.
        </p>
      ) : null}
    </div>
  )
}

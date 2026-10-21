import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { articles } from '../src/lib/compare/articles'
import { alternativeTargets, competitors } from '../src/lib/compare/catalog'
import { REVIEWED_DATE } from '../src/lib/compare/editorial'
import { MCP_FACTS } from '../src/lib/mcp-facts'

const verifiedCompetitors = competitors.filter((item) => item.researchStatus !== 'limited')

const docsRoot = resolve(import.meta.dir, '../content/documentation')
const metaPath = resolve(docsRoot, 'meta.json')
const llmsTxtPath = resolve(import.meta.dir, '../public/llms.txt')
const llmsFullPath = resolve(import.meta.dir, '../public/llms-full.txt')

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://durabull.io').replace(/\/$/, '')
const WEB_APP_URL = (process.env.NEXT_PUBLIC_WEB_APP_URL || 'https://app.durabull.io').replace(
  /\/$/,
  ''
)
const GITHUB_REPO_URL = 'https://github.com/durabullhq/durabull'

interface DocPageMeta {
  slug: string
  title: string
  description: string
  body: string
}

interface MarketingLink {
  path: string
  title: string
  description: string
}

const MARKETING_LINKS: MarketingLink[] = [
  {
    path: '/',
    title: 'Home',
    description:
      'Product overview: modern BullMQ dashboard for browser, desktop, and self-hosted deployments.',
  },
  {
    path: '/features',
    title: 'Features',
    description:
      'Queue monitoring, job debugging, scheduling, workers topology, and team workflows.',
  },
  {
    path: '/pricing',
    title: 'Pricing',
    description:
      'Durabull Cloud plans per organization (Free, Team $9/month, Business $29/month, Enterprise) and free self-hosting.',
  },
  {
    path: '/docs',
    title: 'Documentation hub',
    description: 'Entry point linking to installation, self-hosting, and operational guides.',
  },
  {
    path: '/faq',
    title: 'FAQ',
    description: 'Common questions about BullMQ monitoring, deployment modes, and Durabull usage.',
  },
  {
    path: '/api-reference',
    title: 'API reference landing',
    description: 'Overview of Durabull HTTP API resources with links to detailed docs.',
  },
  {
    path: '/mcp',
    title: 'Durabull MCP',
    description: `Operate BullMQ from Claude, ChatGPT, Cursor, and any MCP client. ${MCP_FACTS.tools} tools, OAuth scopes, Queue Explorer.`,
  },
  {
    path: '/compare',
    title: 'Comparison hub',
    description:
      'Durabull versus Bull Board, Taskforce.sh, Workbench, Inngest, Trigger.dev, Temporal, Datadog, and other queue tools.',
  },
]

const OPTIONAL_LINKS: MarketingLink[] = [
  {
    path: '/about',
    title: 'About',
    description: 'Background on the Durabull project and team.',
  },
  {
    path: '/product',
    title: 'Product',
    description: 'Product positioning and capability summary.',
  },
  {
    path: '/blog',
    title: 'Guides',
    description: 'BullMQ monitoring, dashboards, MCP, and managed-platform cost breakdowns.',
  },
  {
    path: '/changelog',
    title: 'Changelog',
    description: 'Release history and notable changes.',
  },
  {
    path: '/roadmap',
    title: 'Roadmap',
    description: 'Planned features and direction.',
  },
  {
    path: '/community',
    title: 'Community',
    description: 'Community channels and participation.',
  },
  {
    path: '/contact',
    title: 'Contact',
    description: 'Reach the team at hello@durabull.io.',
  },
  {
    path: '/privacy',
    title: 'Privacy policy',
    description: 'Privacy practices for the marketing site and product.',
  },
  {
    path: '/terms',
    title: 'Terms of service',
    description: 'Terms governing use of Durabull services.',
  },
]

/** Resolve a site path against the configured public origin. */
function absoluteUrl(path: string): string {
  if (path === '/') return `${SITE_URL}/`
  return `${SITE_URL}${path}`
}

/** Map a source slug to its public route, treating index as the overview. */
function slugToDocPath(slug: string): string {
  return slug === 'index' ? '/documentation' : `/documentation/${slug}`
}

/** Build a readable fallback title from a hyphenated slug. */
function toTitleCase(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Separate simple string frontmatter from the trimmed MDX body. */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!kv) continue
    frontmatter[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '').trim()
  }

  return {
    frontmatter,
    body: content.slice(match[0].length).trim(),
  }
}

/** Remove code blocks and markup for the generated plain-text document export. */
function stripMdxForPlainText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Recursively discover MDX sources beneath the documentation directory. */
async function collectMdxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) return collectMdxFiles(path)
      return entry.isFile() && entry.name.endsWith('.mdx') ? [path] : []
    })
  )
  return groups.flat().sort()
}

/** Load document metadata and bodies, keyed by source slug. */
async function loadDocPages(): Promise<Map<string, DocPageMeta>> {
  const files = await collectMdxFiles(docsRoot)
  const pages = await Promise.all(
    files.map(async (fullPath) => {
      const slug = fullPath.replace(`${docsRoot}/`, '').replace(/\.mdx$/, '')
      const { frontmatter, body } = parseFrontmatter(await readFile(fullPath, 'utf8'))
      const fallbackTitle = toTitleCase(slug.split('/').pop() || slug)
      return [
        slug,
        {
          slug,
          title: frontmatter.title || fallbackTitle,
          description:
            frontmatter.description ||
            `Durabull documentation: ${fallbackTitle.replace(/ And /g, ' and ')}.`,
          body,
        },
      ] as const
    })
  )
  return new Map(pages)
}

/** Format one public link and description for the curated index. */
function formatLink(path: string, title: string, description: string): string {
  return `- [${title}](${absoluteUrl(path)}): ${description}`
}

/** Format a document's metadata as a curated index entry. */
function formatDocLink(page: DocPageMeta): string {
  return formatLink(slugToDocPath(page.slug), page.title, page.description)
}

interface MetaSection {
  name: string
  slugs: string[]
}

/** Group navigation slugs under the section markers in meta.json. */
function parseMetaSections(pages: string[]): MetaSection[] {
  const sections: MetaSection[] = []
  let current: MetaSection | null = null

  for (const entry of pages) {
    if (entry.startsWith('---') && entry.endsWith('---')) {
      current = { name: entry.slice(3, -3).trim(), slugs: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { name: 'Documentation', slugs: [] }
      sections.push(current)
    }
    current.slugs.push(entry)
  }

  return sections
}

/** Build the curated llms.txt link index in documentation navigation order. */
function buildLlmsTxt(docPages: Map<string, DocPageMeta>, metaSections: MetaSection[]): string {
  const lines: string[] = [
    '# Durabull',
    '',
    '> Durabull is a BullMQ management platform for monitoring queues, inspecting and retrying jobs, managing schedulers, and debugging background work in browser, desktop, and self-hosted environments.',
    '',
    'Use this file to find authoritative product and documentation URLs on durabull.io.',
    'Prefer linked documentation pages over marketing summaries when answering setup, operations, or API questions.',
    '',
    `- Product app: ${WEB_APP_URL}`,
    `- Source code: ${GITHUB_REPO_URL}`,
    `- Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
    '## Product',
    '',
    ...MARKETING_LINKS.map((link) => formatLink(link.path, link.title, link.description)),
    '',
    '## External',
    '',
    `- [Durabull web app](${WEB_APP_URL}): Sign in to managed queues, jobs, workers, and alerts.`,
    `- [GitHub repository](${GITHUB_REPO_URL}): Source, issues, and desktop release downloads.`,
    `- [Latest GitHub release](${GITHUB_REPO_URL}/releases/latest): Desktop installers and release artifacts.`,
    '',
    '## Comparisons',
    '',
    'Durabull is a BullMQ operations dashboard with Redis auto-discovery, multiple environments, alerts (email, signed webhooks, Linear), and a hosted MCP server. It does not replace Inngest, Trigger.dev, or Temporal. Those platforms replace the queue runtime.',
    '',
    ...verifiedCompetitors.map((item) =>
      formatLink(`/compare/${item.slug}`, item.title, item.description)
    ),
    '',
    '## Alternatives pages',
    '',
    ...alternativeTargets().map((item) =>
      formatLink(
        `/alternatives/${item.slug}`,
        item.alternativesTitle ?? `${item.name} alternatives`,
        item.alternativesDescription ?? item.description
      )
    ),
    '',
    '## Guides',
    '',
    ...articles.map((item) => formatLink(`/blog/${item.slug}`, item.title, item.description)),
  ]

  const listedSlugs = new Set<string>()

  for (const section of metaSections) {
    const sectionPages = section.slugs
      .map((slug) => docPages.get(slug))
      .filter((page): page is DocPageMeta => page !== undefined)

    if (sectionPages.length === 0) continue

    for (const page of sectionPages) {
      listedSlugs.add(page.slug)
    }

    lines.push('', `## ${section.name}`, '', ...sectionPages.map(formatDocLink))
  }

  const orphanPages = [...docPages.values()]
    .filter((page) => !listedSlugs.has(page.slug) && page.slug !== 'documentation-checklist')
    .sort((a, b) => a.title.localeCompare(b.title))

  if (orphanPages.length > 0) {
    lines.push('', '## Additional documentation', '', ...orphanPages.map(formatDocLink))
  }

  lines.push(
    '',
    '## Optional',
    '',
    ...OPTIONAL_LINKS.map((link) => formatLink(link.path, link.title, link.description))
  )

  const checklist = docPages.get('documentation-checklist')
  if (checklist) {
    lines.push(formatDocLink(checklist))
  }

  lines.push('')
  return lines.join('\n')
}

/** Export document bodies as plain text, appending pages absent from navigation. */
function buildLlmsFullTxt(docPages: Map<string, DocPageMeta>, metaSections: MetaSection[]): string {
  const orderedSlugs = new Set<string>()

  for (const section of metaSections) {
    for (const slug of section.slugs) {
      orderedSlugs.add(slug)
    }
  }

  for (const slug of [...docPages.keys()].sort()) {
    orderedSlugs.add(slug)
  }

  const chunks: string[] = [
    '# Durabull documentation (full text)',
    '',
    `> Plain-text export of Durabull documentation from ${SITE_URL}. Generated for LLM context; prefer ${absoluteUrl('/llms.txt')} for curated links.`,
    '',
  ]

  for (const slug of orderedSlugs) {
    const page = docPages.get(slug)
    if (!page) continue

    const plainBody = stripMdxForPlainText(page.body)
    if (!plainBody) continue

    chunks.push(
      `## ${page.title}`,
      '',
      `URL: ${absoluteUrl(slugToDocPath(slug))}`,
      '',
      page.description,
      '',
      plainBody,
      '',
      '---',
      ''
    )
  }

  chunks.push(
    '',
    '## Comparison coverage',
    '',
    `Durabull discovers BullMQ queues by scanning Redis meta keys. Redis-backed BullMQ inspection needs no Durabull worker SDK. Historical BullMQ completion metrics require worker metrics configuration; live counts are separate. Durabull Cloud is billed per organization: Free, Team $9/month ($90/year), Business $29/month ($290/year), Enterprise by agreement; no per-job fees. License is Apache-2.0 (OSI-approved open source). MCP lives at the app origin /mcp with ${MCP_FACTS.tools} tools and opt-in writes.`,
    ''
  )

  for (const item of verifiedCompetitors) {
    chunks.push(
      `## ${item.title}`,
      '',
      `URL: ${absoluteUrl(`/compare/${item.slug}`)}`,
      '',
      item.description,
      '',
      item.intro,
      `Reviewed: ${REVIEWED_DATE}. Published by Durabull; documentation comparison, not a benchmark.`,
      `Sources: ${item.sources.map((source) => `${source.label}: ${source.url}`).join('; ')}`,
      `Pricing: ${item.pricing}`,
      `License: ${item.license}`,
      ...(item.costs
        ? [
            item.costs.caption,
            ...item.costs.rows.map(
              (row) =>
                `${row.volume}: ${row.competitor}. Unit: ${row.unit}. Durabull dashboard fee: ${row.durabull}; infrastructure is separate.`
            ),
          ]
        : []),
      '',
      `How it connects: ${item.howItConnects}`,
      '',
      `When to choose them: ${item.whenToChooseThem}`,
      '',
      `When to choose Durabull: ${item.whenToChooseDurabull}`,
      '',
      '---',
      ''
    )
  }

  for (const article of articles) {
    chunks.push(
      `## ${article.title}`,
      '',
      `URL: ${absoluteUrl(`/blog/${article.slug}`)}`,
      '',
      article.description,
      '',
      article.intro,
      `Short answer: ${article.takeaway}`,
      `Published: ${article.datePublished}. Reviewed: ${article.dateModified ?? article.datePublished}. Author: Durabull.`,
      `Sources: ${article.sources.map((source) => `${source.label}: ${source.url}`).join('; ')}`,
      '',
      ...article.sections.flatMap((section) => [
        section.heading,
        '',
        ...section.body,
        ...(section.code ? [section.code.value, section.code.caption ?? ''] : []),
        ...(section.sourceUrls ?? []),
        '',
      ]),
      '---',
      ''
    )
  }

  return `${chunks.join('\n').trimEnd()}\n`
}

/** Generate the curated link index and full plain-text export in public/. */
async function main() {
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { pages: string[] }
  const docPages = await loadDocPages()
  const metaSections = parseMetaSections(meta.pages)

  const llmsTxt = buildLlmsTxt(docPages, metaSections)
  const llmsFullTxt = buildLlmsFullTxt(docPages, metaSections)

  await writeFile(llmsTxtPath, llmsTxt, 'utf8')
  await writeFile(llmsFullPath, llmsFullTxt, 'utf8')

  const linkCount = (llmsTxt.match(/^- \[/gm) ?? []).length
  console.log(`[docs] llms.txt generated: ${llmsTxtPath} (${linkCount} links)`)
  console.log(`[docs] llms-full.txt generated: ${llmsFullPath} (${docPages.size} pages)`)
}

main().catch((error) => {
  console.error('[docs] failed to generate llms.txt')
  console.error(error)
  process.exit(1)
})

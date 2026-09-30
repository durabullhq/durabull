import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

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
    description: 'Plans and beta pricing for Durabull Cloud and self-hosted usage.',
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
    title: 'Blog',
    description: 'Product updates and engineering notes.',
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

function absoluteUrl(path: string): string {
  if (path === '/') return `${SITE_URL}/`
  return `${SITE_URL}${path}`
}

function slugToDocPath(slug: string): string {
  return slug === 'index' ? '/documentation' : `/documentation/${slug}`
}

function toTitleCase(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

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

async function collectMdxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMdxFiles(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }

  return files
}

async function loadDocPages(): Promise<Map<string, DocPageMeta>> {
  const files = await collectMdxFiles(docsRoot)
  const pages = new Map<string, DocPageMeta>()

  for (const fullPath of files) {
    const relativePath = fullPath.replace(`${docsRoot}/`, '')
    const slug = relativePath.replace(/\.mdx$/, '')
    const raw = await readFile(fullPath, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const fallbackTitle = toTitleCase(slug.split('/').pop() || slug)

    pages.set(slug, {
      slug,
      title: frontmatter.title || fallbackTitle,
      description:
        frontmatter.description ||
        `Durabull documentation: ${fallbackTitle.replace(/ And /g, ' and ')}.`,
      body,
    })
  }

  return pages
}

function formatLink(path: string, title: string, description: string): string {
  return `- [${title}](${absoluteUrl(path)}): ${description}`
}

function formatDocLink(page: DocPageMeta): string {
  return formatLink(slugToDocPath(page.slug), page.title, page.description)
}

interface MetaSection {
  name: string
  slugs: string[]
}

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

function buildLlmsFullTxt(docPages: Map<string, DocPageMeta>, metaSections: MetaSection[]): string {
  const orderedSlugs: string[] = []

  for (const section of metaSections) {
    for (const slug of section.slugs) {
      if (!orderedSlugs.includes(slug)) orderedSlugs.push(slug)
    }
  }

  for (const slug of [...docPages.keys()].sort()) {
    if (!orderedSlugs.includes(slug)) orderedSlugs.push(slug)
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

  return chunks.join('\n').trimEnd() + '\n'
}

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

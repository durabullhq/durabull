import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createSearchAPI } from 'fumadocs-core/search/server'
import { articles } from '../src/lib/compare/articles'
import { competitors } from '../src/lib/compare/catalog'

const docsRoot = resolve(import.meta.dir, '../content/documentation')
const outputPath = resolve(import.meta.dir, '../public/search-index.json')

interface SearchIndexEntry {
  title: string
  description?: string
  breadcrumbs: string[]
  content: string
  url: string
  keywords?: string
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
    const key = kv[1]
    const value = kv[2].replace(/^['"]|['"]$/g, '').trim()
    frontmatter[key] = value
  }

  return {
    frontmatter,
    body: content.slice(match[0].length),
  }
}

function stripMdxSyntax(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function relativePathToUrl(relativePath: string): string {
  if (relativePath === 'index.mdx') return '/documentation'
  return `/documentation/${relativePath.replace(/\.mdx$/, '')}`
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

    if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue
    files.push(fullPath)
  }

  return files
}

async function buildIndexes(): Promise<SearchIndexEntry[]> {
  const files = await collectMdxFiles(docsRoot)
  const indexes: SearchIndexEntry[] = []

  for (const fullPath of files) {
    const relativePath = fullPath.replace(`${docsRoot}/`, '')
    const raw = await readFile(fullPath, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const title =
      frontmatter.title ||
      toTitleCase(
        relativePath
          .replace(/\.mdx$/, '')
          .split('/')
          .pop()!
      )
    const description = frontmatter.description
    const content = stripMdxSyntax(body)
    const segments = relativePath.split('/').slice(0, -1)
    const breadcrumbs = ['Documentation', ...segments.map(toTitleCase)]

    indexes.push({
      title,
      description,
      breadcrumbs,
      content,
      url: relativePathToUrl(relativePath),
      keywords: `${title} ${description ?? ''}`.trim(),
    })
  }

  indexes.push(
    ...articles.map((article) => ({
      title: article.title,
      description: article.description,
      breadcrumbs: ['Guides', article.category],
      content: [
        article.takeaway,
        article.intro,
        ...article.sections.flatMap((section) => [section.heading, ...section.body]),
      ].join(' '),
      url: `/blog/${article.slug}`,
      keywords: article.keywords.join(' '),
    })),
    ...competitors
      .filter((item) => item.researchStatus !== 'limited')
      .map((item) => ({
        title: item.title,
        description: item.description,
        breadcrumbs: ['Compare'],
        content: [
          item.intro,
          item.whenToChooseThem,
          item.whenToChooseDurabull,
          ...item.rows.map((row) => `${row.feature}: ${row.competitor}`),
        ].join(' '),
        url: `/compare/${item.slug}`,
        keywords: item.keywords.join(' '),
      }))
  )
  return indexes
}

async function main() {
  const indexes = await buildIndexes()
  const api = createSearchAPI('simple', { indexes })
  const data = await api.export()

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(data), 'utf8')

  console.log(`[docs] search index generated: ${outputPath} (${indexes.length} pages)`)
}

main().catch((error) => {
  console.error('[docs] failed to generate search index')
  console.error(error)
  process.exit(1)
})

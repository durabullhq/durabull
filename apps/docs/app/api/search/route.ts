import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { structure } from 'fumadocs-core/mdx-plugins'
import { type AdvancedIndex, createSearchAPI } from 'fumadocs-core/search/server'

export const dynamic = 'force-static'

const docsRoot = resolve(process.cwd(), 'content/documentation')

/** Turn a directory slug into a breadcrumb label. */
function toTitleCase(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Read simple string metadata separately from the MDX body. */
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

/** Map an MDX source path to its documentation URL, including the index page. */
function relativePathToUrl(relativePath: string): string {
  if (relativePath === 'index.mdx') return '/documentation'
  return `/documentation/${relativePath.replace(/\.mdx$/, '')}`
}

/** Recursively collect the MDX sources used to build the search index. */
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

/** Index page metadata, headings, and prose for section-level browser search. */
async function buildIndexes(): Promise<AdvancedIndex[]> {
  const files = await collectMdxFiles(docsRoot)
  const indexes: AdvancedIndex[] = []

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
    const url = relativePathToUrl(relativePath)
    const segments = relativePath.split('/').slice(0, -1)
    const breadcrumbs = ['Documentation', ...segments.map(toTitleCase)]

    indexes.push({
      id: url,
      title,
      description,
      breadcrumbs,
      structuredData: structure(body),
      url,
      keywords: `${title} ${description ?? ''}`.trim(),
    })
  }

  return indexes
}

const searchAPI = createSearchAPI('advanced', {
  indexes: () => buildIndexes(),
})

/** Serve the browser-searchable index in both server and static deployments. */
export const GET = searchAPI.staticGET

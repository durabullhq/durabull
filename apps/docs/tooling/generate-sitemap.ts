import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { articles } from '../src/lib/compare/articles'
import { alternativeTargets, competitors } from '../src/lib/compare/catalog'
import { REVIEWED_DATE } from '../src/lib/compare/editorial'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://durabull.io').replace(/\/$/, '')
const docsRoot = resolve(import.meta.dir, '../content/documentation')
const staticPaths = [
  '/',
  '/mcp',
  '/compare',
  '/blog',
  '/features',
  '/pricing',
  '/docs',
  '/documentation',
  '/faq',
  '/about',
  '/api-reference',
  '/changelog',
  '/community',
  '/contact',
  '/privacy',
  '/product',
  '/roadmap',
  '/terms',
]
const files = await readdir(docsRoot, { recursive: true })
const docPaths = files
  .filter((file) => file.endsWith('.mdx') && file !== 'documentation-checklist.mdx')
  .map((file) =>
    `/documentation/${file.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, '')
  )
const entries: { path: string; modified?: string }[] = [
  ...[...new Set([...staticPaths, ...docPaths])].map((path) => ({ path })),
  ...competitors
    .filter((item) => item.researchStatus !== 'limited')
    .map((item) => ({ path: `/compare/${item.slug}`, modified: REVIEWED_DATE })),
  ...alternativeTargets()
    .filter((item) => item.researchStatus !== 'limited')
    .map((item) => ({ path: `/alternatives/${item.slug}`, modified: REVIEWED_DATE })),
  ...articles.map((item) => ({
    path: `/blog/${item.slug}`,
    modified: item.dateModified ?? item.datePublished,
  })),
]
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(({ path, modified }) => `  <url><loc>${escapeXml(`${SITE_URL}${path === '/' ? '/' : `${path}/`}`)}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`
await writeFile(resolve(import.meta.dir, '../public/sitemap.xml'), xml, 'utf8')
console.log(`[docs] sitemap.xml generated (${entries.length} URLs, content dates only)`)

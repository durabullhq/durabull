import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { articles } from '../src/lib/compare/articles'
import { alternativeTargets, competitors } from '../src/lib/compare/catalog'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://durabull.io').replace(/\/$/, '')
const sitemapPath = resolve(import.meta.dir, '../public/sitemap.xml')
const lastmod = new Date().toISOString()

const staticPages: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/mcp', changefreq: 'weekly', priority: '0.95' },
  { path: '/compare', changefreq: 'weekly', priority: '0.95' },
  { path: '/blog', changefreq: 'weekly', priority: '0.85' },
  { path: '/features', changefreq: 'weekly', priority: '0.8' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.8' },
  { path: '/docs', changefreq: 'weekly', priority: '0.8' },
  { path: '/documentation', changefreq: 'weekly', priority: '0.8' },
  { path: '/faq', changefreq: 'monthly', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/api-reference', changefreq: 'weekly', priority: '0.5' },
  { path: '/changelog', changefreq: 'weekly', priority: '0.5' },
  { path: '/community', changefreq: 'monthly', priority: '0.4' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/product', changefreq: 'weekly', priority: '0.5' },
  { path: '/roadmap', changefreq: 'weekly', priority: '0.4' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
]

function loc(path: string): string {
  if (path === '/') return `${SITE_URL}/`
  return `${SITE_URL}${path}`
}

function urlEntry(path: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${loc(path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

const urls = [
  ...staticPages.map((page) => urlEntry(page.path, page.changefreq, page.priority)),
  ...competitors.map((item) => urlEntry(`/compare/${item.slug}`, 'monthly', '0.8')),
  ...alternativeTargets().map((item) => urlEntry(`/alternatives/${item.slug}`, 'monthly', '0.75')),
  ...articles.map((item) => urlEntry(`/blog/${item.slug}`, 'monthly', '0.8')),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`

await writeFile(sitemapPath, xml, 'utf8')
console.log(`[docs] sitemap.xml generated: ${sitemapPath} (${urls.length} urls)`)

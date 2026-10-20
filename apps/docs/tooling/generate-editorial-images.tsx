import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { ImageResponse } from 'next/og'
import { articles } from '../src/lib/compare/articles'
import { alternativeTargets, competitors } from '../src/lib/compare/catalog'
import { editorialImagePath } from '../src/lib/compare/editorial'

const publicRoot = resolve(import.meta.dir, '../public')
const font = await readFile(
  resolve(import.meta.dir, '../node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf')
)
const entries: {
  kind: 'blog' | 'compare' | 'alternatives'
  slug?: string
  title: string
  label: string
}[] = [
  {
    kind: 'compare' as const,
    title: 'The right tool for the work ahead.',
    label: 'The queue tooling field guide',
  },
  {
    kind: 'blog' as const,
    title: 'Background jobs. Foreground thinking.',
    label: 'Durabull field guides',
  },
  ...competitors.map((item) => ({
    kind: 'compare' as const,
    slug: item.slug,
    title: `Durabull vs ${item.name}`,
    label: 'Compare · capabilities, costs & tradeoffs',
  })),
  ...alternativeTargets().map((item) => ({
    kind: 'alternatives' as const,
    slug: item.slug,
    title: item.alternativesTitle ?? `${item.name} alternatives`,
    label: 'A practical, sourced shortlist',
  })),
  ...articles.map((item) => ({
    kind: 'blog' as const,
    slug: item.slug,
    title: item.title,
    label: `Field guide · ${item.category}`,
  })),
]
// Include the generator source so template changes cannot reuse stale local assets.
const templateVersion = await readFile(import.meta.filename, 'utf8')
const cacheRoot = resolve(import.meta.dir, '../node_modules/.cache/editorial-images')
await mkdir(cacheRoot, { recursive: true })
for (const entry of entries) {
  const path = resolve(publicRoot, `.${editorialImagePath(entry.kind, entry.slug)}`)
  const hash = createHash('sha256')
    .update(templateVersion)
    .update(JSON.stringify(entry))
    .update(font)
    .digest('hex')
  const cachePath = resolve(cacheRoot, `${entry.kind}-${entry.slug ?? 'index'}.hash`)
  if (
    (await readFile(cachePath, 'utf8').catch(() => null)) === hash &&
    (await readFile(path).then(
      () => true,
      () => false
    ))
  )
    continue
  const image = new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#f5f4ee',
        color: '#171914',
        fontFamily: 'Geist',
        padding: 64,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 800, position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 21,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#a63b08',
          }}
        >
          <div style={{ width: 10, height: 10, background: '#c9531b' }} />
          {entry.label}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 48,
            fontSize: entry.title.length > 55 ? 58 : 72,
            lineHeight: 1.06,
            letterSpacing: -3,
            maxWidth: 810,
          }}
        >
          {entry.title}
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 22, color: '#68675d' }}>
          Research for teams running background work.
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          position: 'absolute',
          right: 54,
          top: 170,
          width: 150,
        }}
      >
        {['QUEUE', 'WORKER', 'OPERATE'].map((label, i) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 80,
              border: `1px solid ${i === 2 ? '#b34d1c' : '#bbc0ac'}`,
              background: i === 2 ? '#f0dfcf' : '#e7eadf',
              color: i === 2 ? '#a63b08' : '#5b6850',
              fontSize: 16,
              letterSpacing: 2,
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 64,
          right: 64,
          fontSize: 25,
          letterSpacing: -1,
        }}
      >
        durabull.io
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 1200,
          height: 8,
          background: '#c9531b',
        }}
      />
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Geist', data: font, style: 'normal', weight: 500 }],
    }
  )
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(await image.arrayBuffer()))
  await writeFile(cachePath, hash)
}
console.log(`[docs] ${entries.length} editorial share images ready`)

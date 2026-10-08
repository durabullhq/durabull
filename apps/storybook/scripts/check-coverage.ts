import { readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../../..')
async function files(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (
        await readdir(directory, { withFileTypes: true })
      ).map((entry) =>
        entry.isDirectory()
          ? files(resolve(directory, entry.name))
          : [resolve(directory, entry.name)]
      )
    )
  ).flat()
}
const stories = (await files(resolve(root, 'apps/storybook/src'))).filter((path) =>
  /\.(tsx|ts)$/.test(path)
)
const source = (await Promise.all(stories.map((path) => Bun.file(path).text()))).join('\n')
const screenPaths = new Set(
  [...source.matchAll(/path: ['"]([^'"]+)['"]/g)].map((match) => match[1].split('?')[0])
)
// Infrastructure has no independent visual output and is exercised by the decorators/screens.
const exclusions: Record<string, string> = {
  'apps/web/src/components/theme-provider.tsx': 'Every story uses ThemeProvider.',
  'apps/web/src/components/connection-provider.tsx': 'Every web component uses ConnectionProvider.',
  'apps/docs/src/components/posthog-provider.tsx':
    'Telemetry provider; intentionally disabled in the public catalog.',
  'apps/docs/src/components/google-analytics.tsx':
    'Telemetry injection; intentionally disabled in the public catalog.',
}
const roots = [
  'apps/web/src/components',
  'apps/docs/src/components',
  'packages/email/src/templates',
]
let covered = 0
const missing: string[] = []
const uiFiles = (
  await Promise.all(roots.map((directory) => files(resolve(root, directory))))
).flat()
for (const path of uiFiles) {
  if (!path.endsWith('.tsx') || path.includes('.test.')) continue
  const key = relative(root, path)
  if (exclusions[key]) continue
  const modulePath = key.replace(/^apps\/(web|docs)\/src\//, '').replace(/\.tsx$/, '')
  if (!source.includes(modulePath)) missing.push(key)
  else covered++
}
const routeFiles = await files(resolve(root, 'apps/web/src/routes'))
const routeSources = await Promise.all(
  routeFiles
    .filter((path) => path.endsWith('.tsx') && !path.includes('.test.'))
    .map(async (path) => ({ path, text: await Bun.file(path).text() }))
)
for (const { path, text } of routeSources) {
  if (!path.endsWith('.tsx') || path.includes('.test.') || path.endsWith('__root.tsx')) continue
  const match = text.match(/createFileRoute\(\s*'([^']+)'\s*\)/)
  if (
    !match ||
    !text.includes('component:') ||
    text.includes('<Outlet') ||
    text.includes('component: LegacySettingsRedirect')
  )
    continue
  const route = match[1]
    .replaceAll('_/', '/')
    .replaceAll('$orgSlug', 'acme')
    .replaceAll('$connectionId', 'demo-redis')
    .replaceAll('$queueName', 'email%3Areceipts')
    .replaceAll('$jobId', 'job-1042')
    .replaceAll('$schedulerId', 'daily-summary')
    .replaceAll('$ruleId', 'demo-rule')
    .replaceAll('$invitationId', 'demo-invite')
  if (!screenPaths.has(route)) missing.push(relative(root, path))
  else covered++
}
const marketingPages = (await files(resolve(root, 'apps/docs/app'))).filter(
  (path) =>
    path.endsWith('/page.tsx') && !path.includes('/documentation/') && !path.includes('/v2/')
)
for (const path of marketingPages) {
  const modulePath = relative(resolve(root, 'apps'), path).replace(/\.tsx$/, '')
  if (!source.includes(modulePath)) missing.push(relative(root, path))
  else covered++
}
const appSource = await Bun.file(resolve(root, 'packages/mcp/src/apps/ui/app.ts')).text()
for (const [, name] of appSource.matchAll(/case '([^']+)':/g)) {
  if (!source.includes(`tool: '${name}'`) && !source.includes(`tool: "${name}"`))
    missing.push(`MCP app view: ${name}`)
}
if (missing.length) throw new Error(`UI needs a catalog story:\n${missing.join('\n')}`)
console.info(
  `Storybook coverage: ${covered} UI modules/screens; MCP app views covered. ${Object.keys(exclusions).length} documented infrastructure exclusions.`
)

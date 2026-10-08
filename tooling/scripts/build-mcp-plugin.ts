import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const repo = resolve(import.meta.dir, '../..')
const canonical = resolve(repo, 'plugins/durabull')

/** Check resolved path containment before allowing plugin output to be copied. */
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

/** Accept credential-free /mcp HTTPS endpoints, with HTTP permitted only on loopback. */
export function validateEndpoint(input: string): string {
  const url = new URL(input)
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error(
      'MCP endpoint must use HTTPS (HTTP is allowed only on loopback for development).'
    )
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/mcp') {
    throw new Error('Use an origin followed by /mcp, without credentials, query, or fragment.')
  }
  return url.href
}

/** Generate host overlays from the canonical manifest, or verify their exact freshness in check mode. */
export async function buildPlugin(
  options: { endpoint?: string; out?: string; check?: boolean } = {}
) {
  const sourceManifest = JSON.parse(await readFile(resolve(canonical, 'plugin.json'), 'utf8'))
  const sourceMcp = JSON.parse(await readFile(resolve(canonical, 'mcp.json'), 'utf8'))
  const endpoint = validateEndpoint(options.endpoint ?? sourceMcp.mcpServers.durabull.url)
  const destination = options.out ? resolve(options.out) : canonical
  if (
    destination !== canonical &&
    (contains(canonical, destination) || contains(destination, canonical))
  ) {
    throw new Error('Output must not contain, or be inside, the canonical plugin directory.')
  }
  if (destination === canonical && endpoint !== sourceMcp.mcpServers.durabull.url) {
    throw new Error(
      'Use --out for a self-hosted package; the canonical Cloud package stays unchanged.'
    )
  }
  const { extensions: _extensions, $schema: _schema, ...claude } = sourceManifest
  const files = {
    'mcp.json': {
      ...sourceMcp,
      mcpServers: { durabull: { type: 'streamable-http', url: endpoint } },
    },
    '.mcp.json': { mcpServers: { durabull: { type: 'http', url: endpoint } } },
    '.claude-plugin/plugin.json': claude,
  }
  if (!options.check && destination !== canonical) {
    await mkdir(destination, { recursive: true })
    await cp(canonical, destination, { recursive: true })
  }
  for (const [path, value] of Object.entries(files)) {
    const output = `${JSON.stringify(value, null, 2)}\n`
    const file = resolve(destination, path)
    if (options.check) {
      if ((await readFile(file, 'utf8')) !== output)
        throw new Error(`${path} is stale; run bun run mcp:plugin.`)
    } else {
      await mkdir(resolve(file, '..'), { recursive: true })
      await writeFile(file, output)
    }
  }
  return destination
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const value = (key: string) => {
    const index = args.indexOf(key)
    if (index < 0) return undefined
    if (!args[index + 1] || args[index + 1].startsWith('--'))
      throw new Error(`${key} needs a value`)
    return args[index + 1]
  }
  console.info(
    await buildPlugin({
      endpoint: value('--endpoint'),
      out: value('--out'),
      check: args.includes('--check'),
    })
  )
}

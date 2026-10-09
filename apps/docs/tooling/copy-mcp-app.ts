import { resolve } from 'node:path'

/**
 * Publish the production Queue Explorer MCP App bundle so the marketing site embeds the
 * same UI that hosts render, instead of a hand-drawn copy that drifts.
 */
const root = resolve(import.meta.dir, '..')
const source = resolve(root, '../../packages/mcp/src/apps/dashboard.generated.txt')
await Bun.write(resolve(root, 'public/mcp-app.html'), Bun.file(source))

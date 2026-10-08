import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import type { Plugin } from 'vite'

/** Bundle the current production app sources without modifying the checked-in MCP asset. */
export function mcpAppPlugin(root: string): Plugin {
  const id = '\0virtual:durabull-mcp-app'
  const ui = resolve(root, 'packages/mcp/src/apps/ui')
  return {
    name: 'durabull-mcp-app',
    resolveId(source) {
      if (source === 'virtual:durabull-mcp-app') return id
    },
    async load(source) {
      if (source !== id) return
      const result = await build({
        entryPoints: [resolve(ui, 'app.ts')],
        bundle: true,
        write: false,
        minify: true,
        platform: 'browser',
        format: 'esm',
        metafile: true,
      })
      for (const input of Object.keys(result.metafile!.inputs)) this.addWatchFile(resolve(input))
      this.addWatchFile(resolve(ui, 'app.css'))
      const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script')
      const css = await readFile(resolve(ui, 'app.css'), 'utf8')
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Durabull · Queue explorer</title><style>${css}</style></head><body><main id="app" aria-label="Durabull queue explorer"><div class="empty" role="status">Connecting to Durabull…</div></main><script type="module">${script}</script></body></html>`
      return `export default ${JSON.stringify(html)}`
    },
    handleHotUpdate(context) {
      if (!context.file.includes('/packages/mcp/src/')) return
      const module = context.server.moduleGraph.getModuleById(id)
      if (module) context.server.moduleGraph.invalidateModule(module)
      context.server.ws.send({ type: 'full-reload' })
    },
  }
}

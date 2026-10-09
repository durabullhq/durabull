import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { bundleMcpApp } from '../../../packages/mcp/scripts/bundle-app'

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
      const { html, files } = await bundleMcpApp()
      for (const file of files) this.addWatchFile(file)
      this.addWatchFile(resolve(ui, 'styles.css'))
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

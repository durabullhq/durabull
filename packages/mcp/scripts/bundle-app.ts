import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { build, type Rollup } from 'vite'

const ui = resolve(import.meta.dirname, '../src/apps/ui')

/**
 * Bundle the React app into one self-contained HTML document: inline script and styles,
 * no external assets, so the resource works under an empty MCP Apps CSP.
 */
export async function bundleMcpApp(): Promise<{ html: string; files: string[] }> {
  const output = (await build({
    configFile: false,
    root: ui,
    logLevel: 'warn',
    mode: 'production',
    plugins: [tailwindcss()],
    esbuild: { jsx: 'automatic', jsxDev: false, legalComments: 'none' },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      cssCodeSplit: false,
      assetsInlineLimit: Number.POSITIVE_INFINITY,
      modulePreload: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: resolve(ui, 'main.tsx'),
        // Apps SDK UI marks components "use client" for RSC frameworks; irrelevant here.
        onwarn(warning, warn) {
          if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning)
        },
        output: { format: 'es', inlineDynamicImports: true, entryFileNames: 'app.js' },
      },
    },
  })) as Rollup.RollupOutput
  const chunk = output.output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')
  const styles = output.output.filter(
    (item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css')
  )
  if (!chunk || output.output.length !== styles.length + 1)
    throw new Error('MCP App bundle must contain exactly one script and its styles')
  const js = chunk.code.replaceAll('</script', '<\\/script')
  const css = styles
    .map((style) => String(style.source))
    .join('\n')
    .replaceAll('</style', '<\\/style')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Durabull · Queue explorer</title><style>${css}</style></head><body><main id="app" aria-label="Durabull queue explorer"></main><script type="module">${js}</script></body></html>`
  return { html, files: chunk.moduleIds.filter((id) => !id.startsWith('\0')) }
}

import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const build = await Bun.build({
  entrypoints: [resolve(import.meta.dir, 'preview/host.ts')],
  target: 'browser',
})
if (!build.success) throw new AggregateError(build.logs, 'Preview host build failed')
const script = await build.outputs[0].text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.MCP_PREVIEW_PORT ?? 4318),
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/host.js')
      return new Response(script, { headers: { 'content-type': 'text/javascript' } })
    if (path === '/app')
      return new Response(Bun.file(resolve(root, 'src/apps/dashboard.generated.txt')), {
        headers: {
          'content-type': 'text/html',
          'content-security-policy':
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
        },
      })
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Durabull MCP App preview</title><style>body{margin:0;background:#e7ece8;font:12px sans-serif}header{padding:12px;color:#4f6558}iframe{border:0;display:block;width:100%;min-height:650px}</style><header>PREVIEW FIXTURES · No connection to customer data</header><iframe title="Durabull app" sandbox="allow-scripts"></iframe><script type="module" src="/host.js"></script>',
      { headers: { 'content-type': 'text/html' } }
    )
  },
})
console.info(`MCP App preview: ${server.url}`)

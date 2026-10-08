import type { McpToolDefinition } from '../tools/tool-catalog'

export const MCP_APP_URI = 'ui://durabull/queue-explorer-v1.html'
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app'
export const MCP_APP_ICON = {
  src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33"><rect x="3" y="3" width="14" height="4" rx="1.5"/><rect x="3" y="9" width="14" height="4" rx="1.5"/><path d="M3 16h14M6 5h1m-1 6h1"/></svg>')}`,
  mimeType: 'image/svg+xml',
  sizes: ['20x20'],
}

/** Standard MCP Apps metadata plus optional ChatGPT surfaces; no host detection required. */
export function toolAppMetadata(tool: McpToolDefinition): Record<string, unknown> {
  const securitySchemes = [
    { type: 'oauth2', scopes: [...new Set(['mcp:discover', ...tool.requiredScopes])] },
  ]
  return {
    securitySchemes,
    ...(tool.name === 'ping'
      ? {}
      : {
          ui: {
            resourceUri: MCP_APP_URI,
            visibility: tool.annotations.readOnlyHint ? ['model', 'app'] : ['model'],
          },
          'openai/outputTemplate': MCP_APP_URI,
          'openai/widgetAccessible': tool.annotations.readOnlyHint,
          'openai/toolInvocation/invoking': tool.annotations.readOnlyHint
            ? 'Reading Durabull…'
            : 'Updating Durabull…',
          'openai/toolInvocation/invoked': 'Durabull is ready',
          ...(tool.name === 'list_connections'
            ? { 'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } }
            : {}),
        }),
  }
}

export const appResourceMetadata = {
  ui: {
    prefersBorder: true,
    csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] },
  },
  'openai/widgetDescription':
    'Interactive BullMQ queue explorer. Browse connections, queues, jobs, failures and metrics; refresh data and ask the assistant to investigate or perform a scoped operation.',
  'openai/widgetPrefersBorder': true,
  'openai/widgetCSP': { connect_domains: [], resource_domains: [], frame_domains: [] },
  'openai/ui': { availableDisplayModes: ['inline', 'fullscreen', 'pip'] },
}

import { registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { appResourceMetadata, MCP_APP_MIME_TYPE, MCP_APP_URI } from './app-metadata'
import dashboardHtml from './dashboard.generated.txt' with { type: 'text' }

/** Register the static app shell with host metadata; customer data arrives via authorized tools. */
export function registerQueueExplorer(server: McpServer, widgetDomain?: string): void {
  const metadata = {
    ...appResourceMetadata,
    ...(widgetDomain ? { 'openai/widgetDomain': new URL(widgetDomain).origin } : {}),
  }
  registerAppResource(
    server,
    'queue_explorer',
    MCP_APP_URI,
    {
      title: 'Durabull queue explorer',
      description: 'An interactive queue, job and alert explorer. Contains no customer data.',
      _meta: metadata,
    },
    async () => ({
      contents: [
        {
          uri: MCP_APP_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: dashboardHtml,
          _meta: metadata,
        },
      ],
    })
  )
}

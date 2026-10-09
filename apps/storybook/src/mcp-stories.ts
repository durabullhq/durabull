import type { ArgTypes } from '@storybook/react-vite'
import type { McpPreviewProps } from './mcp-preview'

/** Shared controls for every MCP card: host surface, theme, device and data state. */
export const mcpArgTypes: Partial<ArgTypes<McpPreviewProps>> = {
  host: { control: 'inline-radio', options: ['chatgpt', 'claude'] },
  theme: { control: 'inline-radio', options: ['light', 'dark'] },
  device: { control: 'inline-radio', options: ['desktop', 'phone'] },
  displayMode: { control: 'inline-radio', options: ['inline', 'fullscreen'] },
  state: { control: 'select', options: ['ready', 'empty', 'loading', 'error'] },
  tool: { control: false },
  args: { control: 'object' },
}

export const mcpDocs = (description: string) => ({
  layout: 'padded',
  docs: {
    description: {
      component: `${description} Rendered by the production MCP app (Apps SDK UI) in a sandboxed iframe; a real AppBridge supplies schema-checked fixture data. Read tools stay local; assistant requests appear in Host activity.`,
    },
  },
})

/** Standard host variants, mirroring how the card appears in each assistant. */
export const inChatGptDark = { args: { host: 'chatgpt', theme: 'dark' } } as const
export const inClaude = { args: { host: 'claude', theme: 'light' } } as const
export const inClaudeDark = { args: { host: 'claude', theme: 'dark' } } as const
export const onPhone = { args: { device: 'phone' } } as const

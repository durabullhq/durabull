import { WEB_APP_URL } from '@/lib/config'

/**
 * Durabull MCP facts quoted in marketing copy. Keep in sync with
 * packages/mcp/src/tools/tool-catalog.ts, auth/scopes.ts,
 * prompts/prompt-catalog.ts and plugins/durabull/skills.
 */
export const MCP_URL = `${WEB_APP_URL}/mcp`
export const MCP_HOST_PATH = MCP_URL.replace(/^https?:\/\//, '')

export const MCP_FACTS = {
  tools: 30,
  readTools: 21,
  writeTools: 9,
  scopes: 9,
  skills: 9,
  prompts: 4,
} as const

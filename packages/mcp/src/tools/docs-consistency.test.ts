import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MCP_ALL_SCOPES } from '../auth/scopes'
import { MCP_PROMPT_CATALOG } from '../prompts/prompt-catalog'
import { MCP_RESOURCE_CATALOG } from '../resources/resource-catalog'
import { MCP_TOOL_CATALOG } from './tool-catalog'

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

/**
 * The catalog is the source of truth; these tests keep the human-facing docs from drifting
 * away from it when tools, scopes, resources, or prompts change.
 */
describe('MCP docs stay in sync with the catalog', () => {
  const userDoc = read('apps/docs/content/documentation/integrations/mcp-server.mdx')
  const adr = read('docs/adr/0001-mcp-security-architecture.md')

  it('user doc lists every tool with its required scopes', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      expect(userDoc).toContain(`\`${tool.name}\``)
      for (const scope of tool.requiredScopes) {
        expect(userDoc).toContain(`\`${scope}\``)
      }
    }
  })

  it('user doc and ADR list every scope', () => {
    for (const scope of MCP_ALL_SCOPES) {
      expect(userDoc).toContain(`\`${scope}\``)
      expect(adr).toContain(`\`${scope}\``)
    }
  })

  it('ADR lists every tool, resource template, and prompt', () => {
    for (const tool of MCP_TOOL_CATALOG) {
      expect(adr).toContain(`\`${tool.name}\``)
    }
    for (const resource of MCP_RESOURCE_CATALOG) {
      const suffix = resource.uriTemplate
        .replace('durabull://', '')
        .replace('{connectionId}', '{id}')
      expect(adr).toContain(suffix)
    }
    for (const prompt of MCP_PROMPT_CATALOG) {
      expect(adr).toContain(`\`${prompt.name}\``)
    }
  })

  it('user doc lists every prompt and resource template', () => {
    for (const prompt of MCP_PROMPT_CATALOG) {
      expect(userDoc).toContain(`\`${prompt.name}\``)
    }
    for (const resource of MCP_RESOURCE_CATALOG) {
      expect(userDoc).toContain(`\`${resource.uriTemplate}\``)
    }
  })
})

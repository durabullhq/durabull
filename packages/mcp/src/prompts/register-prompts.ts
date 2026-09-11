import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { MCP_PROMPT_CATALOG } from './prompt-catalog'

/**
 * Registers prompt templates. Prompts perform no I/O and touch no customer data, so they are
 * gated only by the transport scope (`mcp:discover`) like `tools/list`.
 */
export function registerPrompts(server: McpServer): void {
  for (const prompt of MCP_PROMPT_CATALOG) {
    const argsSchema: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {}
    for (const argument of prompt.arguments) {
      const base = z.string().min(1).describe(argument.description)
      argsSchema[argument.name] = argument.required ? base : base.optional()
    }

    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema,
      },
      (args) => ({
        description: prompt.title,
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: prompt.render(args as Record<string, string | undefined>),
            },
          },
        ],
      })
    )
  }
}

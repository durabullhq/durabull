import type { ComponentType } from 'react'
import { MCP_FACTS } from '@/lib/mcp-facts'
import { cn } from '@/lib/utils'
import {
  ClaudeCodeMark,
  ClaudeMark,
  CodexMark,
  CopilotMark,
  CursorMark,
  GeminiMark,
  GrokMark,
  MetaMark,
  OpenAIMark,
  WindsurfMark,
} from './brand-marks'

export interface Host {
  name: string
  maker: string
  Mark: ComponentType<{ className?: string }>
  /** what Durabull delivers inside this host */
  surface: string
}

/** Hosts with a documented Durabull path (see docs/mcp-apps-and-plugins.md). */
export const featuredHosts: Host[] = [
  { name: 'Claude', maker: 'Anthropic', Mark: ClaudeMark, surface: 'Connector + interactive app' },
  { name: 'ChatGPT', maker: 'OpenAI', Mark: OpenAIMark, surface: 'Plugin + interactive app' },
  { name: 'Cowork', maker: 'Anthropic', Mark: ClaudeMark, surface: 'Connector + interactive app' },
  {
    name: 'Claude Code',
    maker: 'Anthropic',
    Mark: ClaudeCodeMark,
    surface: `Plugin + ${MCP_FACTS.skills} skills`,
  },
  {
    name: 'Codex',
    maker: 'OpenAI',
    Mark: CodexMark,
    surface: `Plugin + ${MCP_FACTS.skills} skills`,
  },
]

/** Remote-MCP clients Durabull has not documented or tested yet. */
export const openHosts: Host[] = [
  { name: 'Cursor', maker: 'Anysphere', Mark: CursorMark, surface: 'Standard remote MCP' },
  { name: 'Muse', maker: 'Meta', Mark: MetaMark, surface: 'Standard remote MCP' },
  { name: 'Grok', maker: 'xAI', Mark: GrokMark, surface: 'Standard remote MCP' },
  { name: 'GitHub Copilot', maker: 'GitHub', Mark: CopilotMark, surface: 'Standard remote MCP' },
  { name: 'Windsurf', maker: 'Windsurf', Mark: WindsurfMark, surface: 'Standard remote MCP' },
  { name: 'Gemini CLI', maker: 'Google', Mark: GeminiMark, surface: 'Standard remote MCP' },
]

export const allHosts = [...featuredHosts, ...openHosts]

/** Compact inline logo row, e.g. under a hero. */
export function HostRow({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center justify-center gap-x-6 gap-y-3', className)}>
      {allHosts.map((h) => (
        <li
          key={h.name}
          className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--v2-muted)]"
        >
          <h.Mark className="size-[18px] shrink-0 text-[var(--v2-fg)]" />
          {h.name}
        </li>
      ))}
    </ul>
  )
}

export function TrademarkNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] leading-relaxed text-[var(--v2-faint)]', className)}>
      Product names and logos are trademarks of their respective owners and are shown to indicate
      compatibility, not endorsement. Claude, Cowork, ChatGPT, Claude Code, and Codex have
      documented Durabull setups. Other clients are listed for standard remote MCP and have not been
      tested by Durabull; support varies by client, plan, and version.
    </p>
  )
}

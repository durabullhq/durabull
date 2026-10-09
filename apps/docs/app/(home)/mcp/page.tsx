import type { Metadata } from 'next'
import { McpApps } from '@/components/mcp/mcp-apps'
import { McpCapabilities } from '@/components/mcp/mcp-capabilities'
import { McpFaq, McpFinalCta, McpWorksWith } from '@/components/mcp/mcp-closing'
import { McpConnect } from '@/components/mcp/mcp-connect'
import { McpHero, McpStats } from '@/components/mcp/mcp-hero'
import { McpSafety } from '@/components/mcp/mcp-safety'
import { V2Footer } from '@/components/v2/closing'
import { V2Nav } from '@/components/v2/nav'
import { SITE_URL } from '@/lib/config'
import { mcpFaqs } from '@/lib/mcp-faqs'
import { createBreadcrumbSchema, createFAQSchema, createMetadata } from '@/lib/seo'

const baseMetadata = createMetadata(
  {
    title: 'Durabull MCP: Operate BullMQ from your AI agent',
    description:
      'Durabull MCP connects Claude, ChatGPT, Codex, Cursor and any MCP client to your BullMQ queues. Triage failures, retry jobs, manage alerts, and check Redis health from a chat, with scoped OAuth and an interactive Queue Explorer app.',
    keywords: [
      'BullMQ MCP',
      'MCP server',
      'Model Context Protocol',
      'MCP Apps',
      'Claude connector',
      'ChatGPT plugin',
      'Cursor MCP',
      'AI agent queue monitoring',
      'agentic operations',
      'Redis',
    ],
  },
  '/mcp'
)

// createMetadata appends the site name and the root layout template appends it again
export const metadata: Metadata = {
  ...baseMetadata,
  title: { absolute: 'Durabull MCP: Operate BullMQ from your AI agent' },
}

export default function McpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            createBreadcrumbSchema([
              { name: 'Home', url: SITE_URL },
              { name: 'Durabull MCP', url: `${SITE_URL}/mcp` },
            ]),
            createFAQSchema(mcpFaqs),
          ]),
        }}
      />
      <V2Nav />
      <main>
        <McpHero />
        <McpStats />
        <McpCapabilities />
        <McpApps />
        <McpWorksWith />
        <McpSafety />
        <McpConnect />
        <McpFaq />
        <McpFinalCta />
      </main>
      <V2Footer />
    </>
  )
}

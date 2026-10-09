// Shared by the MCP landing page FAQ and its FAQPage structured data.
import { MCP_FACTS } from '@/lib/mcp-facts'

export const mcpFaqs = [
  {
    question: 'What is Durabull MCP?',
    answer: `MCP, the Model Context Protocol, is an open standard that lets AI agents use tools in other software. Durabull MCP is our MCP server. It gives your agent ${MCP_FACTS.tools} tools to inspect and operate BullMQ queues, jobs, workers, schedulers, alerts, and Redis health on your Durabull connections.`,
  },
  {
    question: 'Which AI agents does it work with?',
    answer: `Claude, Cowork, and ChatGPT connect with the URL and show the interactive Queue Explorer. Claude Code and Codex can install the Durabull plugin with ${MCP_FACTS.skills} skills. Other clients that support remote MCP with OAuth, such as Cursor, can use the same URL and get the tools as text; we haven't tested every client yet.`,
  },
  {
    question: 'What can my agent change?',
    answer:
      'Only what you allow. Read access is the default. Write scopes let an agent retry failed jobs, promote delayed jobs, pause or resume queues, and acknowledge, resolve, or snooze alerts, and each one is opt-in. Deleting, purging, obliterating, editing payloads, and raw Redis commands are not available through MCP at all.',
  },
  {
    question: 'Who at our company can connect?',
    answer:
      'Anyone with a Durabull login. Each person signs in with their own account, so their agent can only reach the connections they can already open in the dashboard.',
  },
  {
    question: 'Does the model see secrets from my job payloads?',
    answer:
      'Every response is redacted on the server first. Secrets, passwords, connection URLs, bearer tokens, JWTs, and API keys are removed, long strings are truncated, and the response reports how many values were redacted.',
  },
  {
    question: 'Can I use it with a self-hosted Durabull?',
    answer:
      'Yes. The MCP server ships with Durabull and runs at /mcp on your own Durabull URL, using the same OAuth flow. You can also generate a plugin package that points at your endpoint.',
  },
  {
    question: 'Do we still use the dashboard?',
    answer:
      'Yes. MCP works on the same account and the same data, so everything your agent does shows up in the dashboard, and anything you do in the dashboard is visible to your agent.',
  },
]

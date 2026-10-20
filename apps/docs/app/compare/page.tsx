import { CompareHubPage } from '@/components/compare/hub-page'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata = createAbsoluteMetadata(
  {
    title: 'Compare Durabull to BullMQ dashboards and job platforms',
    description:
      'Durabull versus Bull Board, Taskforce.sh, Workbench, Inngest, Trigger.dev, Temporal, Datadog, and every other queue tool we could verify. MCP featured throughout.',
    keywords: [
      'BullMQ dashboard comparison',
      'Bull Board alternative',
      'best BullMQ dashboard',
      'BullMQ MCP',
      'Taskforce.sh alternative',
    ],
  },
  '/compare'
)

export default function ComparePage() {
  return <CompareHubPage />
}

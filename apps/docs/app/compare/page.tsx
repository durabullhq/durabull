import { CompareHubPage } from '@/components/compare/hub-page'
import { editorialImagePath } from '@/lib/compare/editorial'
import { createAbsoluteMetadata } from '@/lib/seo'

export const metadata = createAbsoluteMetadata(
  {
    ogImage: editorialImagePath('compare'),
    title: 'Compare Durabull to BullMQ dashboards and job platforms',
    description:
      'Compare BullMQ dashboards, job runtimes, and observability tools by deployment, features, pricing, and tradeoffs. Official sources linked on every comparison.',
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

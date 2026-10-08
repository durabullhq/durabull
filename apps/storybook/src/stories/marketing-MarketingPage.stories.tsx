import { MarketingPage } from '@docs/components/marketing-page'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Marketing Page/MarketingPage',
  component: MarketingPage,
  args: {
    badge: 'Durabull',
    title: 'Queue operations, clearly presented.',
    subtitle: 'Connect Redis and keep background work moving.',
    sections: [
      {
        title: 'Inspect every job',
        description: 'Find failures, read logs, and replay work with context.',
        items: ['Queue monitoring', 'Job recovery', 'Scheduled work'],
      },
    ],
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MarketingPage>
export default meta
export const Default: StoryObj<typeof meta> = {}

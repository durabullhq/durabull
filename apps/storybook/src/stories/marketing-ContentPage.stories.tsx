import { ContentGrid, ContentPage } from '@docs/components/v2/content-page'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'

const meta = {
  title: 'Marketing/V2 / Content Page/ContentPage',
  component: ContentPage,
  args: {
    label: 'Developer APIs',
    title: 'API Reference',
    intro: "Automate queue operations and observability with Durabull's REST endpoints.",
    primaryCta: { label: 'HTTP API Reference', to: '/documentation/reference/http-api' },
    secondaryCta: { label: 'Browse Docs', to: '/documentation' },
    sections: [
      {
        title: 'Queues',
        description: 'Inspect queue health, pause/resume queues, and review throughput.',
        items: ['List queues', 'Toggle pause', 'Fetch metrics'],
      },
      {
        title: 'Jobs',
        description: 'Retrieve job history and automate retries.',
        items: ['Query by status', 'Retry or remove', 'View payload metadata'],
      },
      {
        title: 'Signals',
        description: 'Send alert notifications to your tooling.',
        items: ['Webhook subscriptions', 'Alert thresholds', 'Status checks'],
      },
    ],
    note: 'The REST API ships with every deployment and uses session authentication.',
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ContentPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const SingleSection: Story = {
  args: {
    label: 'Product Updates',
    title: 'Changelog',
    intro: "See what's new in Durabull — from fresh features to reliability upgrades.",
    secondaryCta: undefined,
    sections: [
      {
        title: 'Release notes',
        description: 'See published versions, release notes, and desktop assets on GitHub.',
      },
    ],
  },
}
export const GridOnly: Story = {
  render: (args) => <ContentGrid label="Capabilities" sections={args.sections} />,
}

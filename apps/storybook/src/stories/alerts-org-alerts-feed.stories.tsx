import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { OrgAlertsFeed } from '@/components/alerts/org-alerts-feed'

const meta = {
  title: 'Web Components/Alerts/Org Alerts Feed',
  component: OrgAlertsFeed,
  args: { orgSlug: 'acme', status: 'open', onFiltersChange: fn() },
} satisfies Meta<typeof OrgAlertsFeed>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { parameters: { fixtureState: 'empty' } }
export const Loading: Story = { parameters: { fixtureState: 'loading' } }
export const Unavailable: Story = { parameters: { fixtureState: 'error' } }

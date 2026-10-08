import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { AlertEventsTable } from '@/components/alerts/alert-events-table'
import { event } from '../fixtures/data'

const meta = {
  title: 'Web Components/Alerts/Alert Events Table',
  component: AlertEventsTable,
  args: {
    orgSlug: 'acme',
    events: [event] as ComponentProps<typeof AlertEventsTable>['events'],
    emptyTitle: 'No incidents',
    emptyCopy: 'Your queues are healthy.',
    onResolve: fn(),
    onAcknowledge: fn(),
  },
} satisfies Meta<typeof AlertEventsTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { args: { events: [] } }
export const Acknowledged: Story = {
  args: {
    events: [
      { ...event, acknowledgedAt: '2026-10-08T12:01:00Z', acknowledgedByName: 'Alex Morgan' },
    ] as ComponentProps<typeof AlertEventsTable>['events'],
  },
}

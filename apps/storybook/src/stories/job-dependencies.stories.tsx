import type { Meta, StoryObj } from '@storybook/react-vite'
import { JobDependencies } from '@/components/job-dependencies'

const meta = {
  title: 'Web Components/Job Dependencies',
  component: JobDependencies,
  args: {
    orgSlug: 'acme',
    connectionId: 'demo-redis',
    queueName: 'reports',
    jobId: 'report-1042',
  },
} satisfies Meta<typeof JobDependencies>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { parameters: { fixtureState: 'empty' } }
export const Loading: Story = { parameters: { fixtureState: 'loading' } }
export const Unavailable: Story = { parameters: { fixtureState: 'error' } }

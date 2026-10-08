import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { JobPayloadEditor } from '@/components/job-payload-editor'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Job Payload Editor',
  component: JobPayloadEditor,
  args: { original: payload, value: payload, onChange: fn() },
} satisfies Meta<typeof JobPayloadEditor>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

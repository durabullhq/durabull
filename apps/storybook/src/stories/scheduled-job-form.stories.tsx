import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ScheduledJobForm } from '@/components/scheduled-job-form'

const meta = {
  title: 'Web Components/Scheduled Job Form',
  component: ScheduledJobForm,
  args: { mode: 'create', queueName: 'email:receipts', onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof ScheduledJobForm>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Submitting: Story = { args: { isSubmitting: true } }

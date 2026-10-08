import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { JobOptionsFields } from '@/components/job-options-fields'
import { createDefaultJobOptionsFormValue } from '@/lib/job-options'

const meta = {
  title: 'Web Components/Job Options Fields',
  component: JobOptionsFields,
  args: { value: createDefaultJobOptionsFormValue(), onChange: fn() },
} satisfies Meta<typeof JobOptionsFields>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

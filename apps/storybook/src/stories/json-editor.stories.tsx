import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { JsonEditor } from '@/components/json-editor'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Json Editor',
  component: JsonEditor,
  args: { value: payload, onChange: fn() },
} satisfies Meta<typeof JsonEditor>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

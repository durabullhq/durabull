import type { Meta, StoryObj } from '@storybook/react-vite'
import { JsonViewer } from '@/components/json-viewer'
import { payload } from '../fixtures/data'

const meta = {
  title: 'Web Components/Json Viewer',
  component: JsonViewer,
  args: { data: payload, initialExpanded: true },
} satisfies Meta<typeof JsonViewer>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DestinationMultiSelect } from '@/components/alerts/destination-multi-select'

const meta = {
  title: 'Web Components/Alerts/Destination Multi Select',
  component: DestinationMultiSelect,
  args: {
    destinations: [
      { id: 'demo-destination', name: 'Operations email', type: 'email', enabled: true },
    ],
    selectedDestinationIds: [],
    onSelectedDestinationIdsChange: fn(),
  },
} satisfies Meta<typeof DestinationMultiSelect>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

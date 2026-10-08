import { V2ValueGrid } from '@docs/components/v2/features'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Features/V2ValueGrid',
  component: V2ValueGrid,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2ValueGrid>
export default meta
export const Default: StoryObj<typeof meta> = {}

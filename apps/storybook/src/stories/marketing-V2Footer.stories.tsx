import { V2Footer } from '@docs/components/v2/closing'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Closing/V2Footer',
  component: V2Footer,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Footer>
export default meta
export const Default: StoryObj<typeof meta> = {}

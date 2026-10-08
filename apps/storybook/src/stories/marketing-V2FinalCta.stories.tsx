import { V2FinalCta } from '@docs/components/v2/closing'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Closing/V2FinalCta',
  component: V2FinalCta,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2FinalCta>
export default meta
export const Default: StoryObj<typeof meta> = {}

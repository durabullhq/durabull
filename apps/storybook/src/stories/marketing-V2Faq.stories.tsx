import { V2Faq } from '@docs/components/v2/faq'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Faq/V2Faq',
  component: V2Faq,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Faq>
export default meta
export const Default: StoryObj<typeof meta> = {}

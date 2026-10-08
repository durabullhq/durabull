import { FAQ } from '@docs/components/sections/faq'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Sections / Faq/FAQ',
  component: FAQ,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FAQ>
export default meta
export const Default: StoryObj<typeof meta> = {}

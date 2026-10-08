import { V2Hero } from '@docs/components/v2/hero'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Hero/V2Hero',
  component: V2Hero,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof V2Hero>
export default meta
export const Default: StoryObj<typeof meta> = {}

import { Eyebrow } from '@docs/components/v2/reveal'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Reveal/Eyebrow',
  component: Eyebrow,
  args: { children: <p className="p-12 text-xl">Queue operations, clearly presented.</p> },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Eyebrow>
export default meta
export const Default: StoryObj<typeof meta> = {}

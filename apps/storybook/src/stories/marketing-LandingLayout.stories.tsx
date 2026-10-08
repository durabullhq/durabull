import { LandingLayout } from '@docs/components/landing-layout'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Landing Layout/LandingLayout',
  component: LandingLayout,
  args: { children: <p className="p-12 text-xl">Queue operations, clearly presented.</p> },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LandingLayout>
export default meta
export const Default: StoryObj<typeof meta> = {}

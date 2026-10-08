import { CornerMarks } from '@docs/components/v2/reveal'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Reveal/CornerMarks',
  component: CornerMarks,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CornerMarks>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <div className="relative m-8 h-48 border p-8">
      <CornerMarks />
      <p>Architectural section accents</p>
    </div>
  ),
}

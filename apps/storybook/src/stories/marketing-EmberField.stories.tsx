import { EmberField } from '@docs/components/v2/ember-field'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/V2 / Ember Field/EmberField',
  component: EmberField,
  args: {},
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EmberField>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <div className="relative h-96 bg-black">
      <EmberField />
    </div>
  ),
}

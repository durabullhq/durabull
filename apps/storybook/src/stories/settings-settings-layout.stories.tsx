import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingsLayout } from '@/components/settings/settings-layout'

const meta = {
  title: 'Web Components/Settings/Settings Layout',
  component: SettingsLayout,
  args: {
    orgSlug: 'acme',
    children: (
      <div className="catalog-panel">
        <h2>Workspace settings</h2>
        <p>Choose a section to configure your workspace.</p>
      </div>
    ),
  },
} satisfies Meta<typeof SettingsLayout>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

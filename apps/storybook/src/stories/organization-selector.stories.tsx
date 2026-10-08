import type { Meta, StoryObj } from '@storybook/react-vite'
import { OrganizationSelector } from '@/components/organization-selector'

const meta = {
  title: 'Web Components/Organization Selector',
  component: OrganizationSelector,
  args: {},
} satisfies Meta<typeof OrganizationSelector>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

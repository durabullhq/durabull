import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { OrganizationOnboarding } from '@/components/organization-onboarding'

const meta = {
  title: 'Web Components/Organization Onboarding',
  component: OrganizationOnboarding,
  args: { orgSlug: 'acme', organizationName: 'Acme Operations', onSkip: fn() },
} satisfies Meta<typeof OrganizationOnboarding>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

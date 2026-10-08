import type { Meta, StoryObj } from '@storybook/react-vite'
import { SecretInput } from '@/components/secret-input'

const meta = {
  title: 'Web Components/Secret Input',
  component: SecretInput,
  args: { defaultValue: 'demo-secret-only', placeholder: 'Enter a secret' },
} satisfies Meta<typeof SecretInput>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

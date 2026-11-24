import type { Meta, StoryObj } from '@storybook/react-vite'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlertEmail } from '../../../../packages/email/src/templates/alert'
import { InviteEmail } from '../../../../packages/email/src/templates/invite'

const invitationRole = 'member'
const meta = { title: 'Email/Templates', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const Invitation: Story = {
  render: () => (
    <iframe
      title="Organization invitation email"
      sandbox=""
      style={{ width: '100%', height: 900, border: 0 }}
      srcDoc={renderToStaticMarkup(
        <InviteEmail
          recipientEmail="alex@example.com"
          inviterName="Sam Rivera"
          inviterEmail="sam@example.com"
          organizationName="Acme Operations"
          inviteLink="https://example.com/demo-invite"
          role={invitationRole}
          expiresAt={new Date('2026-10-15T12:00:00Z')}
        />
      )}
    />
  ),
}
export const Incident: Story = {
  render: () => (
    <iframe
      title="Queue alert email"
      sandbox=""
      style={{ width: '100%', height: 900, border: 0 }}
      srcDoc={renderToStaticMarkup(
        <AlertEmail
          alertRuleName="Receipt failures"
          queueName="email:receipts"
          connectionName="Production"
          summary="7 jobs failed within 5 minutes"
          firedAt={new Date('2026-10-08T12:00:00Z')}
          context={{ failed: 7, threshold: 5 }}
          dashboardUrl="https://example.com/demo-dashboard"
          muteUrl="https://example.com/demo-mute"
        />
      )}
    />
  ),
}

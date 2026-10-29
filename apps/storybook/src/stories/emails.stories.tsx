import type { Meta, StoryObj } from '@storybook/react-vite'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlertEmail } from '../../../../packages/email/src/templates/alert'
import {
  BillingTransitionEmail,
  type BillingTransitionEmailProps,
} from '../../../../packages/email/src/templates/billing-transition'
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

const transitionEmail: BillingTransitionEmailProps = {
  kind: 'transition_notice',
  organizationName: 'Acme Operations',
  deadlineLabel: 'Monday, January 14, 2030 at 17:00 UTC',
  billingUrl: 'https://example.com/acme/settings/billing',
  pricingUrl: 'https://example.com/pricing',
  proposedPlan: 'Team ($9/month)',
  paidPlanName: 'Team',
  priceSummary:
    'Team is $9/month and Business is $29/month per organization, not per seat, with 2 months free on annual billing.',
  restrictions: [
    'Enabled Redis connections: 3 in use (Production, Staging, Preview); Free includes 1, and you choose which stay active',
  ],
  featuresInUse: ['Webhook alerts'],
  paidFeatures: [
    'Bulk recovery',
    'MCP write operations',
    'Service accounts',
    'Webhook alerts',
    'Linear alerts',
  ],
  historyNote:
    'Redis health history on Free covers the last 24 hours; older history is kept for 7 more days in case you upgrade, then removed.',
}

function TransitionPreview({
  props,
  title,
}: {
  props: BillingTransitionEmailProps
  title: string
}) {
  return (
    <iframe
      title={title}
      sandbox=""
      style={{ width: '100%', height: 1000, border: 0 }}
      srcDoc={renderToStaticMarkup(<BillingTransitionEmail {...props} />)}
    />
  )
}

export const BillingTransitionNotice: Story = {
  render: () => <TransitionPreview title="Billing transition notice" props={transitionEmail} />,
}
export const BillingTransitionFitsFree: Story = {
  render: () => (
    <TransitionPreview
      title="Billing transition notice for an organization within Free"
      props={{ ...transitionEmail, restrictions: [], featuresInUse: [] }}
    />
  ),
}
export const BillingTransitionFinalReminder: Story = {
  render: () => (
    <TransitionPreview
      title="Billing transition final reminder"
      props={{ ...transitionEmail, kind: 'reminder_1d' }}
    />
  ),
}

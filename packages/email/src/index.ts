import { render } from '@react-email/components'
import { getResendClient, isEmailConfigured } from './client'
import { AlertEmail, type AlertEmailProps } from './templates/alert'
import { InviteEmail, type InviteEmailProps } from './templates/invite'

/**
 * The from address for all Durabull emails.
 *
 * Override with the EMAIL_FROM env var (e.g. "Acme Ops <ops@acme.example>")
 * when self-hosting against a Resend account that does not control the
 * default durabull.io domain. Falls back to the upstream default.
 */
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Durabull <no-reply@durabull.io>'

/**
 * Data passed from better-auth's organization plugin when an invitation is created.
 * This matches the type expected by the plugin's sendInvitationEmail callback.
 */
export interface InvitationEmailData {
  id: string
  email: string
  role: string
  organization: {
    id: string
    name: string
    slug: string
    createdAt: Date
    logo?: string | null
    metadata?: unknown
  }
  invitation: {
    id: string
    organizationId: string
    email: string
    role: string
    status: string
    expiresAt: Date
    inviterId: string
    teamId?: string | null
  }
  inviter: {
    id: string
    userId: string
    organizationId: string
    role: string
    createdAt: Date
    user: {
      id: string
      name: string
      email: string
      image?: string | null
    }
  }
}

/**
 * Options for configuring email sending.
 */
export interface EmailOptions {
  /** Base URL of the application (e.g., https://durabull.io) */
  baseUrl: string
}

export type { AlertEmailProps }

export async function sendAlertNotificationEmail(
  data: AlertEmailProps & { to: string }
): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn('[email] RESEND_API_KEY not configured, skipping alert email')
    return
  }

  const { to, ...props } = data
  const html = await render(AlertEmail(props))
  const text = await render(AlertEmail(props), { plainText: true })
  const resend = getResendClient()

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Alert: ${props.summary}`,
    html,
    text,
  })

  if (error) {
    console.error('[email] Failed to send alert email:', error)
    throw new Error(`Failed to send alert email: ${error.message}`)
  }

  console.log(`[email] Alert email sent to ${to}`)
}

/**
 * Create the sendInvitationEmail function with the given options.
 * This is designed to be passed to better-auth's organization plugin.
 */
export function createInvitationEmailSender(options: EmailOptions) {
  return async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
    // Skip if email is not configured
    if (!isEmailConfigured()) {
      console.warn('[email] RESEND_API_KEY not configured, skipping invitation email')
      return
    }

    // Use the invitation ID for the dedicated invite acceptance page
    const inviteLink = `${options.baseUrl}/invite/${data.id}`

    const emailProps: InviteEmailProps = {
      recipientEmail: data.email,
      inviterName: data.inviter.user.name,
      inviterEmail: data.inviter.user.email,
      organizationName: data.organization.name,
      inviteLink,
      role: data.role,
      expiresAt: data.invitation.expiresAt,
    }

    // Render the React Email template to HTML and plain text
    const html = await render(InviteEmail(emailProps))
    const text = await render(InviteEmail(emailProps), { plainText: true })

    const resend = getResendClient()

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `You've been invited to join ${data.organization.name} on Durabull`,
      html,
      text,
    })

    if (error) {
      console.error('[email] Failed to send invitation email:', error)
      throw new Error(`Failed to send invitation email: ${error.message}`)
    }

    console.log(`[email] Invitation email sent to ${data.email}`)
  }
}

// Re-export utilities
export { isEmailConfigured } from './client'
export type { InviteEmailProps } from './templates/invite'

import { env } from '@durabull/env'
import { render } from '@react-email/components'
import { getResendClient, isEmailConfigured } from './client'
import { AlertEmail, type AlertEmailProps } from './templates/alert'
import {
  BillingTransitionEmail,
  type BillingTransitionEmailProps,
  billingTransitionSubject,
} from './templates/billing-transition'
import { InviteEmail, type InviteEmailProps } from './templates/invite'

/**
 * Options for configuring email sending.
 */
export interface EmailOptions {
  /** Base URL of the application (e.g., https://durabull.io) */
  baseUrl: string
}

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
    from: env.EMAIL_FROM,
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
      from: env.EMAIL_FROM,
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

/** Resend errors after which the email may still have been accepted. */
const UNCERTAIN_RESEND_ERRORS = new Set([
  'application_error',
  'internal_server_error',
  'concurrent_idempotent_requests',
])

/**
 * A billing email that was not confirmed sent. `uncertain` means the provider
 * may have accepted it (network failure, server error), so a retry must reuse
 * the idempotency key; otherwise it was definitely rejected.
 */
export class BillingEmailError extends Error {
  constructor(
    message: string,
    readonly uncertain: boolean
  ) {
    super(message)
    this.name = 'BillingEmailError'
  }
}

/**
 * Send one beta-transition notice or reminder to an organization owner.
 * Returns the provider message id. Throws when sending fails so the caller can
 * retry it later (see BillingEmailError for whether to keep the key).
 */
export async function sendBillingTransitionEmail(
  data: BillingTransitionEmailProps & { to: string; idempotencyKey: string }
): Promise<{ id: string | null }> {
  if (!isEmailConfigured()) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  const { to, idempotencyKey, ...props } = data
  const html = await render(BillingTransitionEmail(props))
  const text = await render(BillingTransitionEmail(props), { plainText: true })
  // The idempotency key makes a retried send (after a crash between sending
  // and recording it) a no-op at the provider.
  const { data: sent, error } = await getResendClient().emails.send(
    {
      from: env.EMAIL_FROM,
      to,
      subject: billingTransitionSubject(props.kind, props.organizationName, props.deadlineLabel),
      html,
      text,
    },
    { idempotencyKey }
  )
  if (error) {
    throw new BillingEmailError(
      `Failed to send billing notice: ${error.message}`,
      UNCERTAIN_RESEND_ERRORS.has(error.name)
    )
  }
  return { id: sent?.id ?? null }
}

// Re-export utilities
export { isEmailConfigured } from './client'
export type {
  BillingTransitionEmailKind,
  BillingTransitionEmailProps,
} from './templates/billing-transition'
export type { InviteEmailProps } from './templates/invite'

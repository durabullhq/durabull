import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type BillingTransitionEmailKind = 'transition_notice' | 'reminder_7d' | 'reminder_1d'

/**
 * Plan facts come from the caller (the billing catalog), so the email never
 * restates prices, limits or feature names on its own.
 */
export interface BillingTransitionEmailProps {
  kind: BillingTransitionEmailKind
  organizationName: string
  /** When beta access ends, already formatted, e.g. "Monday, January 14, 2030 at 17:00 UTC". */
  deadlineLabel: string
  billingUrl: string
  pricingUrl: string
  /** Smallest plan that covers current usage, e.g. "Team ($9/month)". */
  proposedPlan: string
  /** Lowest paid plan, e.g. "Team". */
  paidPlanName: string
  /** One sentence on prices, e.g. "Team is $9/month and Business is $29/month per organization…". */
  priceSummary: string
  /** Capacity the Free plan would pause, naming the resources. */
  restrictions: string[]
  /** Paid capabilities the organization uses today. */
  featuresInUse: string[]
  /** Every paid capability, for organizations whose usage fits Free. */
  paidFeatures: string[]
  /** What happens to Redis health history on Free. */
  historyNote: string
}

const COPY: Record<
  BillingTransitionEmailKind,
  { subject: (org: string, deadline: string) => string; heading: string }
> = {
  transition_notice: {
    subject: (org, deadline) => `Choose a Durabull Cloud plan for ${org} by ${deadline}`,
    heading: 'Durabull Cloud is moving to plans',
  },
  reminder_7d: {
    subject: (org) => `Less than a week left to choose a Durabull Cloud plan for ${org}`,
    heading: 'Less than a week left to choose a plan',
  },
  reminder_1d: {
    subject: (org) => `Within 24 hours: ${org} moves to the Durabull Cloud Free plan`,
    heading: 'Your beta access ends within 24 hours',
  },
}

export function billingTransitionSubject(
  kind: BillingTransitionEmailKind,
  organizationName: string,
  deadlineLabel: string
): string {
  return COPY[kind].subject(organizationName, deadlineLabel)
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function BillingTransitionEmail({
  kind = 'transition_notice',
  organizationName = 'Acme Inc',
  deadlineLabel = 'Monday, January 14, 2030 at 17:00 UTC',
  billingUrl = 'https://app.example.com/acme/settings/billing',
  pricingUrl = 'https://example.com/pricing',
  proposedPlan = 'Team ($9/month)',
  paidPlanName = 'Team',
  priceSummary = 'Team is $9/month and Business is $29/month per organization, not per seat.',
  restrictions = [],
  featuresInUse = [],
  paidFeatures = [],
  historyNote = '',
}: BillingTransitionEmailProps) {
  const affected = restrictions.length > 0 || featuresInUse.length > 0

  return (
    <Html>
      <Head />
      <Preview>{billingTransitionSubject(kind, organizationName, deadlineLabel)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={headingStyle}>{COPY[kind].heading}</Heading>

          <Section style={contentCard}>
            {kind === 'transition_notice' ? (
              <Text style={paragraph}>
                Thank you for using Durabull Cloud during the beta. From{' '}
                <span style={highlight}>{deadlineLabel}</span>, Cloud organizations use the Free
                plan unless they subscribe. <span style={highlight}>{organizationName}</span> keeps
                full access until then.
              </Text>
            ) : (
              <Text style={paragraph}>
                <span style={highlight}>{organizationName}</span> keeps full beta access until{' '}
                <span style={highlight}>{deadlineLabel}</span>. After that it uses the Free plan
                unless an owner chooses a plan.
              </Text>
            )}

            {affected ? (
              <>
                <Text style={paragraph}>On the Free plan, {organizationName} would change:</Text>
                {restrictions.map((line) => (
                  <Text key={line} style={listItem}>
                    • {line}
                  </Text>
                ))}
                {featuresInUse.map((feature) => (
                  <Text key={feature} style={listItem}>
                    • {feature} would stop ({paidPlanName} and above)
                  </Text>
                ))}
              </>
            ) : (
              <Text style={paragraph}>
                {organizationName}’s current usage fits the Free plan. {joinList(paidFeatures)} need{' '}
                {paidPlanName} or higher.
              </Text>
            )}

            <Text style={paragraph}>
              Based on current usage, <span style={highlight}>{proposedPlan}</span> covers{' '}
              {organizationName}.
            </Text>

            <Text style={mutedParagraph}>
              {priceSummary} Nothing you configured is deleted: anything above the Free plan’s
              limits is paused and comes back when you upgrade. {historyNote}
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button style={button} href={billingUrl}>
              Choose a plan
            </Button>
          </Section>

          <Section style={noticeSection}>
            <Text style={noticeText}>
              <Link href={pricingUrl} style={footerLink}>
                Compare plans
              </Link>{' '}
              · Self-hosted and desktop Durabull stay free and unchanged.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            You are receiving this because you are an owner of {organizationName} on{' '}
            <Link href="https://durabull.io" style={footerLink}>
              Durabull Cloud
            </Link>
            .
          </Text>
          <Text style={footerMuted}>Can’t click the button? Open {billingUrl}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const emerald = {
  400: '#34d399',
  500: '#10b981',
  950: '#022c22',
}

const neutral = {
  50: '#fafafa',
  200: '#e5e5e5',
  400: '#a3a3a3',
  500: '#737373',
  600: '#525252',
  700: '#404040',
  800: '#262626',
  900: '#171717',
  950: '#0a0a0a',
}

const main = {
  backgroundColor: neutral[950],
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 20px',
}

const container = {
  backgroundColor: neutral[900],
  margin: '0 auto',
  padding: '48px 40px',
  borderRadius: '16px',
  maxWidth: '560px',
  border: `1px solid ${neutral[800]}`,
}

const headingStyle = {
  color: neutral[50],
  fontSize: '26px',
  fontWeight: '600' as const,
  textAlign: 'center' as const,
  margin: '0 0 32px 0',
  letterSpacing: '-0.02em',
}

const contentCard = {
  backgroundColor: neutral[800],
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '8px',
  border: `1px solid ${neutral[700]}`,
}

const paragraph = {
  color: neutral[200],
  fontSize: '16px',
  lineHeight: '1.7',
  margin: '0 0 16px 0',
}

const listItem = {
  color: neutral[200],
  fontSize: '15px',
  lineHeight: '1.5',
  margin: '0 0 6px 8px',
}

const mutedParagraph = {
  color: neutral[400],
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '16px 0 0 0',
}

const highlight = {
  color: neutral[50],
  fontWeight: '600' as const,
}

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  display: 'inline-block',
  padding: '14px 36px',
  backgroundColor: emerald[500],
  color: emerald[950],
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  borderRadius: '8px',
}

const noticeSection = {
  textAlign: 'center' as const,
  marginBottom: '24px',
}

const noticeText = {
  color: neutral[500],
  fontSize: '13px',
  margin: 0,
}

const hr = {
  borderColor: neutral[800],
  borderTopWidth: '1px',
  margin: '24px 0',
}

const footer = {
  color: neutral[400],
  fontSize: '13px',
  textAlign: 'center' as const,
  margin: '0 0 8px 0',
  lineHeight: '1.6',
}

const footerLink = {
  color: emerald[400],
  textDecoration: 'none',
}

const footerMuted = {
  color: neutral[600],
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: 0,
  wordBreak: 'break-all' as const,
}

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

export type BillingTransitionEmailKind = 'notice' | 'reminder_7d' | 'reminder_1d'

export interface BillingTransitionEmailProps {
  kind: BillingTransitionEmailKind
  organizationName: string
  /** When the organization's beta access ends and the Free plan applies. */
  deadline: Date
  billingUrl: string
  pricingUrl: string
  teamMonthlyUsd: number
  businessMonthlyUsd: number
  /** Capacity the Free plan would pause, e.g. "Enabled Redis connections: 3 in use, Free includes 1". */
  restrictions: string[]
  /** Paid capabilities the organization uses today, e.g. "Webhook alerts". */
  featuresInUse: string[]
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

export function formatTransitionDeadline(deadline: Date): string {
  return deadline.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function billingTransitionSubject(
  kind: BillingTransitionEmailKind,
  organizationName: string,
  deadline: Date
): string {
  const date = formatTransitionDeadline(deadline)
  switch (kind) {
    case 'notice':
      return `Choose a Durabull Cloud plan for ${organizationName} by ${date}`
    case 'reminder_7d':
      return `One week left to choose a Durabull Cloud plan for ${organizationName}`
    case 'reminder_1d':
      return `Tomorrow: ${organizationName} moves to the Durabull Cloud Free plan`
  }
}

export function BillingTransitionEmail({
  kind = 'notice',
  organizationName = 'Acme Inc',
  deadline = new Date('2026-11-23T17:00:00Z'),
  billingUrl = 'https://app.durabull.io/acme/settings/billing',
  pricingUrl = 'https://durabull.io/pricing',
  teamMonthlyUsd = 9,
  businessMonthlyUsd = 29,
  restrictions = [],
  featuresInUse = [],
}: BillingTransitionEmailProps) {
  const date = formatTransitionDeadline(deadline)
  const affected = restrictions.length > 0 || featuresInUse.length > 0
  const heading =
    kind === 'notice'
      ? 'Durabull Cloud is moving to plans'
      : kind === 'reminder_7d'
        ? 'One week left to choose a plan'
        : 'Your beta access ends tomorrow'

  return (
    <Html>
      <Head />
      <Preview>{billingTransitionSubject(kind, organizationName, deadline)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={headingStyle}>{heading}</Heading>

          <Section style={contentCard}>
            {kind === 'notice' ? (
              <Text style={paragraph}>
                Thank you for using Durabull Cloud during the beta. From{' '}
                <span style={highlight}>{date}</span>, Cloud organizations use the Free plan unless
                they subscribe. <span style={highlight}>{organizationName}</span> keeps full access
                until then.
              </Text>
            ) : (
              <Text style={paragraph}>
                <span style={highlight}>{organizationName}</span> keeps full beta access until{' '}
                <span style={highlight}>{date}</span>. After that it uses the Free plan unless an
                owner chooses a plan.
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
                    • {feature} would stop (Team and above)
                  </Text>
                ))}
              </>
            ) : (
              <Text style={paragraph}>
                {organizationName}’s current usage fits the Free plan. Webhook and Linear alerts,
                MCP write actions, service accounts and bulk recovery need Team or higher.
              </Text>
            )}

            <Text style={mutedParagraph}>
              Team is ${teamMonthlyUsd}/month and Business is ${businessMonthlyUsd}/month per
              organization, not per seat, with two months free on annual billing. Nothing is
              deleted: anything above the Free plan’s limits is paused and comes back when you
              upgrade.
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

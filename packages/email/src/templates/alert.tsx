import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface AlertEmailProps {
  alertRuleName: string
  queueName: string
  connectionName: string
  summary: string
  firedAt: Date
  context: Record<string, unknown>
  dashboardUrl: string
  muteUrl: string
}

const red = {
  500: '#ef4444',
  700: '#b91c1c',
}

const emerald = {
  500: '#10b981',
  950: '#022c22',
}

const neutral = {
  50: '#fafafa',
  200: '#e5e5e5',
  300: '#d4d4d4',
  400: '#a3a3a3',
  500: '#737373',
  700: '#404040',
  800: '#262626',
  900: '#171717',
  950: '#0a0a0a',
}

function renderContextRows(context: Record<string, unknown>) {
  const entries = Object.entries(context).slice(0, 8)
  if (entries.length === 0) return null

  return entries.map(([key, value]) => (
    <Text key={key} style={contextRow}>
      <span style={contextKey}>{key}:</span> {String(value)}
    </Text>
  ))
}

export function AlertEmail({
  alertRuleName,
  queueName,
  connectionName,
  summary,
  firedAt,
  context,
  dashboardUrl,
  muteUrl,
}: AlertEmailProps) {
  const previewText = `Alert fired for ${queueName}: ${summary}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <div style={logoBox}>
              <svg
                viewBox="0 0 569 569"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                style={{ display: 'block', margin: '10px auto' }}
                role="img"
                aria-label="Durabull"
              >
                <title>Durabull</title>
                <path
                  d="M295 25L515 150.597V401.847L422.757 457"
                  stroke="#064e3b"
                  strokeWidth="28.409"
                  strokeLinecap="round"
                />
                <path
                  d="M274 544L54 418.112V166.281L146.243 111"
                  stroke="#064e3b"
                  strokeWidth="28.409"
                  strokeLinecap="round"
                />
                <path
                  d="M245 55L465 180.659V372.821L372.758 428"
                  stroke="#064e3b"
                  strokeWidth="28.409"
                  strokeLinecap="round"
                />
                <path
                  d="M324 515L105 389.004V196.327L196.823 141"
                  stroke="#064e3b"
                  strokeWidth="28.409"
                  strokeLinecap="round"
                />
                <path
                  d="M195 84L415 209.743V342.783L322.757 398"
                  stroke="#064e3b"
                  strokeWidth="28.409"
                  strokeLinecap="round"
                />
                <path
                  d="M374 484L154 358.657V226.041L246.243 171"
                  stroke="#064e3b"
                  strokeWidth="28.409"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </Section>

          <Section style={severityBanner}>
            <Text style={severityText}>ALERT FIRING</Text>
          </Section>

          <Heading style={heading}>Queue Alert Triggered</Heading>

          <Section style={card}>
            <Text style={summaryText}>{summary}</Text>
            <Text style={detailText}>
              Rule: <span style={detailStrong}>{alertRuleName}</span>
            </Text>
            <Text style={detailText}>
              Connection: <span style={detailStrong}>{connectionName}</span>
            </Text>
            <Text style={detailText}>
              Queue: <span style={detailStrong}>{queueName}</span>
            </Text>
            <Text style={detailText}>
              Fired at:{' '}
              <span style={detailStrong}>
                {firedAt.toLocaleString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </span>
            </Text>
          </Section>

          <Section style={card}>
            <Text style={contextHeading}>Context</Text>
            {renderContextRows(context)}
          </Section>

          <Section style={buttonSection}>
            <Button style={primaryButton} href={dashboardUrl}>
              View Queue
            </Button>
          </Section>

          <Section style={buttonSection}>
            <Link href={muteUrl} style={secondaryLink}>
              Mute this alert
            </Link>
          </Section>

          <Text style={footer}>
            You're receiving this because you configured an alert rule on Durabull.
          </Text>
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
  padding: '36px 30px',
  borderRadius: '14px',
  maxWidth: '560px',
  border: `1px solid ${neutral[800]}`,
}

const logoSection = {
  textAlign: 'center' as const,
  marginBottom: '20px',
}

const logoBox = {
  display: 'inline-block',
  width: '48px',
  height: '48px',
  backgroundColor: emerald[500],
  borderRadius: '10px',
  textAlign: 'center' as const,
}

const severityBanner = {
  backgroundColor: red[700],
  borderRadius: '8px',
  marginBottom: '18px',
  padding: '8px 10px',
  textAlign: 'center' as const,
}

const severityText = {
  margin: 0,
  color: neutral[50],
  fontWeight: '700' as const,
  fontSize: '12px',
  letterSpacing: '0.08em',
}

const heading = {
  color: neutral[50],
  fontSize: '26px',
  fontWeight: '600' as const,
  textAlign: 'center' as const,
  margin: '0 0 24px 0',
}

const card = {
  backgroundColor: neutral[800],
  borderRadius: '12px',
  padding: '18px',
  marginBottom: '16px',
  border: `1px solid ${neutral[700]}`,
}

const summaryText = {
  color: red[500],
  fontSize: '16px',
  lineHeight: '1.5',
  margin: '0 0 12px 0',
  fontWeight: '600' as const,
}

const detailText = {
  color: neutral[300],
  fontSize: '14px',
  margin: '0 0 6px 0',
}

const detailStrong = {
  color: neutral[50],
  fontWeight: '600' as const,
}

const contextHeading = {
  color: neutral[50],
  fontSize: '14px',
  margin: '0 0 10px 0',
  fontWeight: '600' as const,
}

const contextRow = {
  color: neutral[300],
  fontSize: '13px',
  margin: '0 0 6px 0',
  lineHeight: '1.5',
}

const contextKey = {
  color: neutral[200],
  fontWeight: '600' as const,
}

const buttonSection = {
  textAlign: 'center' as const,
  margin: '16px 0',
}

const primaryButton = {
  display: 'inline-block',
  padding: '12px 30px',
  backgroundColor: emerald[500],
  color: emerald[950],
  fontSize: '15px',
  fontWeight: '700' as const,
  textDecoration: 'none',
  borderRadius: '8px',
}

const secondaryLink = {
  color: neutral[400],
  fontSize: '13px',
  textDecoration: 'underline',
}

const footer = {
  color: neutral[500],
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '22px',
}

export default AlertEmail

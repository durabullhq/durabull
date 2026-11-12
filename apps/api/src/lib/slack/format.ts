/** Shared Slack mrkdwn helpers. Slack only requires &, < and > to be escaped. */

export function escapeSlackText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value
}

/** One-line, escaped, length-capped text for headings and fields. */
export function slackInline(value: string, maxLength = 200): string {
  return escapeSlackText(truncate(value.replace(/\s+/g, ' ').trim(), maxLength))
}

/** Inline code; backticks inside would end the span early. */
export function slackCode(value: string, maxLength = 200): string {
  return `\`${slackInline(value, maxLength).replaceAll('`', "'")}\``
}

/** Fenced code block that keeps newlines (stack traces) but cannot break out of the fence. */
export function slackCodeBlock(value: string, maxLength = 1800): string {
  const sanitized = escapeSlackText(value.replaceAll('```', "'''").trim())
  return `\`\`\`${truncate(sanitized, maxLength)}\`\`\``
}

export function slackLink(url: string, label: string): string {
  // Link labels cannot contain `|` or `>`; URLs cannot contain spaces.
  return `<${url.replaceAll(' ', '%20')}|${slackInline(label, 150).replaceAll('|', '¦')}>`
}

/** Renders in each reader's own timezone, with an ISO fallback for old clients. */
export function slackDate(date: Date, format = '{date_short_pretty} at {time}'): string {
  const seconds = Math.floor(date.getTime() / 1000)
  return `<!date^${seconds}^${format}|${date.toISOString()}>`
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  if (totalMinutes < 1) return 'under a minute'
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 48) return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
}

export function plainText(text: string, maxLength = 75) {
  return { type: 'plain_text' as const, text: truncate(text, maxLength), emoji: true }
}

export function mrkdwn(text: string, maxLength = 3000) {
  return { type: 'mrkdwn' as const, text: truncate(text, maxLength) }
}

export const RULE_TYPE_LABELS: Record<string, string> = {
  failure_threshold: 'Failure threshold',
  failure_rate: 'Failure rate',
  queue_stalled: 'Queue stalled',
  job_failed: 'Job failed',
  redis_health: 'Redis health',
}

export function ruleTypeLabel(type: string): string {
  return RULE_TYPE_LABELS[type] ?? type
}

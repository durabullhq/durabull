const SENSITIVE_KEY =
  /(^|_)(secret|password|authorization|api[_-]?key|credential|private[_-]?key|redis[_-]?url|connection[_-]?url|access[_-]?token)(_|$)/i
const REDIS_URL_PATTERN = /redis(s)?:\/\/[^\s]+/gi
const DATABASE_URL_PATTERN = /(postgres|mysql|mongodb)(\+srv)?:\/\/[^\s]+/gi
const BEARER_TOKEN_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g
const API_KEY_PATTERN = /\b(sk|pk)_[a-zA-Z0-9]{8,}\b/g
export const DEFAULT_MCP_TEXT_MAX_LENGTH = 500
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 100
const MAX_OBJECT_KEYS = 200

export interface SanitizeMcpOutputResult {
  value: unknown
  redactionCount: number
}

function redactString(value: string, maxLength: number): { text: string; redactions: number } {
  let redactions = 0
  let text = value

  const patterns = [
    REDIS_URL_PATTERN,
    DATABASE_URL_PATTERN,
    BEARER_TOKEN_PATTERN,
    JWT_PATTERN,
    API_KEY_PATTERN,
  ]

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      redactions += 1
      text = text.replace(pattern, '[redacted]')
    }
    pattern.lastIndex = 0
  }

  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}…`
  }

  return { text, redactions }
}

function sanitizeValue(
  value: unknown,
  depth: number,
  maxTextLength: number
): SanitizeMcpOutputResult {
  if (value == null || depth > MAX_DEPTH) {
    return { value, redactionCount: 0 }
  }

  if (typeof value === 'string') {
    const { text, redactions } = redactString(value, maxTextLength)
    return { value: text, redactionCount: redactions }
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value, redactionCount: 0 }
  }

  if (Array.isArray(value)) {
    let redactionCount = 0
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => {
      const next = sanitizeValue(item, depth + 1, maxTextLength)
      redactionCount += next.redactionCount
      return next.value
    })
    return { value: items, redactionCount }
  }

  if (typeof value === 'object') {
    let redactionCount = 0
    const sanitized: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)
    for (const [key, nested] of entries) {
      if (SENSITIVE_KEY.test(key)) {
        redactionCount += 1
        continue
      }
      const next = sanitizeValue(nested, depth + 1, maxTextLength)
      redactionCount += next.redactionCount
      sanitized[key] = next.value
    }
    return { value: sanitized, redactionCount }
  }

  return { value: undefined, redactionCount: 0 }
}

export function sanitizeMcpOutput(
  value: unknown,
  options?: { maxTextLength?: number }
): SanitizeMcpOutputResult {
  const maxTextLength = options?.maxTextLength ?? DEFAULT_MCP_TEXT_MAX_LENGTH
  return sanitizeValue(value, 0, maxTextLength)
}

export function truncateMcpText(value: string, maxLength = DEFAULT_MCP_TEXT_MAX_LENGTH): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}…`
}

export function sanitizeMcpText(value: string | null | undefined): string | null {
  if (value == null) return null
  const { text, redactions } = redactString(value, DEFAULT_MCP_TEXT_MAX_LENGTH)
  if (!text.trim()) return null
  return redactions > 0 ? text : truncateMcpText(text)
}

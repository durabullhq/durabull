function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue)
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((normalized, key) => {
        normalized[key] = normalizeJsonValue(record[key])
        return normalized
      }, {})
  }

  return value
}

/** True when values differ after normalizing object-key order. */
export function hasJobPayloadChanged(original: unknown, current: unknown): boolean {
  return getJobPayloadKey(original) !== getJobPayloadKey(current)
}

export function getJobPayloadKey(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value)) ?? 'undefined'
}

import { isKnownDurabullTelemetryEvent, sanitizeTelemetryEvent } from '../sanitizer'
import type { ServerAnalyticsRuntimeContext } from './config'

export type TelemetryValidationResult =
  | {
      ok: true
      event: string
      properties: Record<string, string | number | boolean | null | string[]>
    }
  | { ok: false; error: 'unknown_event' | 'invalid_properties' }

export function validateTelemetryPayload(
  eventName: string,
  properties: Record<string, unknown> = {},
  runtimeContext?: ServerAnalyticsRuntimeContext
): TelemetryValidationResult {
  if (!isKnownDurabullTelemetryEvent(eventName)) {
    return { ok: false, error: 'unknown_event' }
  }

  const mergedProperties: Record<string, unknown> = {
    ...properties,
    ...(runtimeContext ?? {}),
  }

  const sanitized = sanitizeTelemetryEvent(eventName, mergedProperties)

  if (sanitized.droppedProperties.length > 0) {
    return { ok: false, error: 'invalid_properties' }
  }

  return {
    ok: true,
    event: sanitized.event,
    properties: sanitized.properties,
  }
}

import { AlertTriangle } from 'lucide-react'
import { JsonEditor } from '@/components/json-editor'

interface JobPayloadEditorProps {
  original: unknown
  value: unknown
  onChange: (value: unknown, isValid: boolean) => void
  minHeight?: string
}

/** Recursively sort object keys so key-order-only diffs compare equal. */
function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue)
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeJsonValue(record[key])
        return acc
      }, {})
  }

  return value
}

/**
 * True when `current` is valid JSON and differs from `original` after
 * normalizing key order (so reordering / whitespace-only edits do not count).
 */
export function hasJobPayloadChanged(
  original: unknown,
  current: unknown,
  isValid: boolean
): boolean {
  if (!isValid) return false
  return (
    JSON.stringify(normalizeJsonValue(original)) !== JSON.stringify(normalizeJsonValue(current))
  )
}

export function JobPayloadEditor({
  original,
  value,
  onChange,
  minHeight = '200px',
}: JobPayloadEditorProps) {
  const isModified = hasJobPayloadChanged(original, value, true)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger" />
          <div className="space-y-1.5 text-sm text-status-danger">
            <p className="font-medium">This overwrites the job payload stored in Redis.</p>
            <p>
              The change cannot be undone. There is no history or backup of the previous payload. A
              malformed payload can make the job fail permanently or crash the worker that processes
              it.
            </p>
          </div>
        </div>
      </div>

      <JsonEditor value={value} onChange={onChange} minHeight={minHeight} />

      <p className="text-xs text-muted-foreground">
        {isModified
          ? 'Payload has been modified from the original.'
          : 'Payload matches the original.'}
      </p>
    </div>
  )
}

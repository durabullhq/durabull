import { AlertTriangle } from 'lucide-react'
import { JsonEditor } from '@/components/json-editor'
import { hasJobPayloadChanged } from '@/lib/job-payload'

interface JobPayloadEditorProps {
  original: unknown
  value: unknown
  onChange: (value: unknown, isValid: boolean) => void
  minHeight?: string
}

export function JobPayloadEditor({
  original,
  value,
  onChange,
  minHeight = '200px',
}: JobPayloadEditorProps) {
  const isModified = hasJobPayloadChanged(original, value)

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

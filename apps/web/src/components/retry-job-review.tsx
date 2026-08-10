import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { JobPayloadEditor } from '@/components/job-payload-editor'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { hasJobPayloadChanged } from '@/lib/job-payload'
import { cn } from '@/lib/utils'

interface RetryJobReviewProps {
  jobData: unknown
  onCancel: () => void
  onRetry: (data?: unknown) => void
}

export function RetryJobReview({ jobData, onCancel, onRetry }: RetryJobReviewProps) {
  const [editorValue, setEditorValue] = useState<unknown>(jobData)
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [payloadExpanded, setPayloadExpanded] = useState(false)
  const [overwriteAcknowledged, setOverwriteAcknowledged] = useState(false)

  const payloadChanged = hasJobPayloadChanged(jobData, editorValue)
  const primaryDisabled = !isJsonValid || (payloadChanged && !overwriteAcknowledged)

  const handleRetry = () => {
    if (primaryDisabled) return
    if (payloadChanged) {
      onRetry(editorValue)
      return
    }
    onRetry()
  }

  return (
    <>
      <div className="space-y-4">
        <Collapsible open={payloadExpanded} onOpenChange={setPayloadExpanded}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40">
            <span>Edit job payload</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                payloadExpanded && 'rotate-180'
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-3">
              <JobPayloadEditor
                original={jobData}
                value={editorValue}
                onChange={(value, isValid) => {
                  setEditorValue(value)
                  setIsJsonValid(isValid)
                }}
                minHeight="180px"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {payloadChanged ? (
          <div className="flex items-start gap-3 rounded-lg border px-4 py-3">
            <input
              id="retry-overwrite-ack"
              type="checkbox"
              aria-labelledby="retry-overwrite-ack-label"
              checked={overwriteAcknowledged}
              onChange={(event) => setOverwriteAcknowledged(event.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <Label
              id="retry-overwrite-ack-label"
              htmlFor="retry-overwrite-ack"
              className="text-sm font-normal leading-5"
            >
              I understand, overwrite the stored payload and retry with it.
            </Label>
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={payloadChanged ? 'destructive' : 'default'}
          onClick={handleRetry}
          disabled={primaryDisabled}
        >
          {payloadChanged ? 'Overwrite Payload & Retry' : 'Retry Job'}
        </Button>
      </DialogFooter>
    </>
  )
}

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
      <div className="space-y-3">
        <Collapsible open={payloadExpanded} onOpenChange={setPayloadExpanded}>
          <CollapsibleTrigger className="flex h-9 w-full items-center justify-between gap-3 rounded-md border bg-card px-3 text-left text-[13px] font-medium transition-colors hover:border-border-strong hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
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
          <div className="flex items-start gap-2.5 rounded-md border px-3 py-2">
            <input
              id="retry-overwrite-ack"
              type="checkbox"
              aria-labelledby="retry-overwrite-ack-label"
              checked={overwriteAcknowledged}
              onChange={(event) => setOverwriteAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border-input accent-destructive"
            />
            <Label
              id="retry-overwrite-ack-label"
              htmlFor="retry-overwrite-ack"
              className="text-[13px] font-normal leading-5"
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

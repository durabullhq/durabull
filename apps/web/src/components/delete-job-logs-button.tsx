import { trackEvent } from '@durabull/analytics/browser'
import { AnalyticsEvents, AnalyticsProperties, DialogType } from '@durabull/analytics/events'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useClearJobLogs } from '@/hooks/use-queues'

interface DeleteJobLogsButtonProps {
  queueName: string
  jobId: string
  logCount: number
}

function formatLogCount(logCount: number): string {
  return `${logCount.toLocaleString()} log${logCount === 1 ? '' : 's'}`
}

const KEEP_OPTIONS = [0, 10, 50, 100] as const

export function DeleteJobLogsButton({ queueName, jobId, logCount }: DeleteJobLogsButtonProps) {
  const clearLogsMutation = useClearJobLogs()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [keepMostRecent, setKeepMostRecent] = useState<number>(0)
  const [customKeepInput, setCustomKeepInput] = useState<string>('25')

  const openConfirm = (keep: number) => {
    if (logCount <= 0 || clearLogsMutation.isPending) {
      return
    }
    setKeepMostRecent(Math.max(0, Math.floor(keep)))
    setConfirmOpen(true)
  }

  const handleDelete = () => {
    if (logCount <= 0 || clearLogsMutation.isPending) {
      return
    }

    clearLogsMutation.mutate(
      { queueName, jobId, keepMostRecent },
      {
        onSuccess: ({ removed }) => {
          setConfirmOpen(false)
          toast.success('Job logs deleted', {
            description:
              keepMostRecent > 0
                ? `Deleted ${formatLogCount(removed)} and kept the most recent ${formatLogCount(keepMostRecent)}.`
                : `Permanently deleted ${formatLogCount(removed)} from Redis.`,
          })
        },
        onError: (error) => {
          toast.error('Failed to delete job logs', {
            description: error.message,
          })
        },
      }
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            disabled={logCount <= 0 || clearLogsMutation.isPending}
            data-testid="delete-job-logs-button"
          >
            {clearLogsMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                Clear Logs
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {KEEP_OPTIONS.map((keep) => (
            <DropdownMenuItem
              key={keep}
              onClick={() => openConfirm(keep)}
              disabled={clearLogsMutation.isPending}
            >
              {keep === 0 ? 'Delete all logs' : `Keep latest ${keep.toLocaleString()} logs`}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 pb-1 pt-1">
            <Label htmlFor="custom-log-keep" className="text-xs text-muted-foreground">
              Keep most recent X logs
            </Label>
            <Input
              id="custom-log-keep"
              value={customKeepInput}
              onChange={(event) => setCustomKeepInput(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              inputMode="numeric"
              className="mt-1 h-7 font-mono text-xs"
            />
          </div>
          <DropdownMenuItem
            onClick={() => {
              const parsed = Number.parseInt(customKeepInput, 10)
              openConfirm(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
            }}
            disabled={clearLogsMutation.isPending}
          >
            Apply custom keep value
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(newOpen) => {
          trackEvent(newOpen ? AnalyticsEvents.DIALOG_OPENED : AnalyticsEvents.DIALOG_CLOSED, {
            [AnalyticsProperties.DIALOG_TYPE]: DialogType.DELETE_JOB_LOGS,
          })
          setConfirmOpen(newOpen)
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Clear Job Logs?</DialogTitle>
            <DialogDescription>
              {keepMostRecent > 0
                ? `This will delete older logs and keep the most recent ${formatLogCount(keepMostRecent)} for this job.`
                : `This will permanently delete ${formatLogCount(logCount)} from Redis for this job.`}{' '}
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={clearLogsMutation.isPending}
              data-testid="delete-job-logs-confirm-button"
            >
              {clearLogsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : keepMostRecent > 0 ? (
                `Keep ${formatLogCount(keepMostRecent)}`
              ) : (
                `Delete ${formatLogCount(logCount)}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

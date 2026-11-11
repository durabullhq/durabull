import { ChevronDown, Trash2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useMemo, useState } from 'react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type ButtonProps = ComponentProps<typeof Button>

interface JobRemoveButtonProps {
  isScheduledJob: boolean
  isPending?: boolean
  onRemoveJobOnly: () => void
  onRemoveJobAndStopScheduler: () => void
  label?: string
  subject?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}

export function JobRemoveButton({
  isScheduledJob,
  isPending = false,
  onRemoveJobOnly,
  onRemoveJobAndStopScheduler,
  label = 'Remove',
  subject = 'this job',
  variant = 'outline',
  size = 'sm',
  className,
}: JobRemoveButtonProps) {
  const iconClass = size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  // Destructive actions stay quiet (outline + danger text) until the confirm dialog.
  const triggerClass = cn(
    variant === 'outline' &&
      'text-status-danger hover:border-status-danger/40 hover:bg-status-danger/10 hover:text-status-danger',
    className
  )
  const [confirmAction, setConfirmAction] = useState<'job' | 'scheduler' | null>(null)

  const confirmCopy = useMemo(() => {
    if (confirmAction === 'scheduler') {
      return {
        title: 'Remove Job & Stop Scheduler?',
        description: `This will permanently remove ${subject} and stop future scheduled runs. This action cannot be undone.`,
        confirmLabel: 'Remove & Stop Scheduler',
      }
    }

    if (isScheduledJob) {
      return {
        title: 'Remove Scheduled Job Instance?',
        description: `This will remove ${subject}, but the scheduler will continue creating future runs.`,
        confirmLabel: 'Remove Job Only',
      }
    }

    return {
      title: 'Remove Job?',
      description: `This will permanently remove ${subject} from the queue. This action cannot be undone.`,
      confirmLabel: 'Remove Job',
    }
  }, [confirmAction, isScheduledJob, subject])

  const handleConfirm = () => {
    const action = confirmAction
    setConfirmAction(null)

    if (action === 'scheduler') {
      onRemoveJobAndStopScheduler()
      return
    }

    onRemoveJobOnly()
  }

  if (!isScheduledJob) {
    return (
      <>
        <Button
          size={size}
          variant={variant}
          onClick={() => setConfirmAction('job')}
          disabled={isPending}
          className={triggerClass}
        >
          <Trash2 className={iconClass} />
          {label}
        </Button>
        <JobRemoveConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(open) => setConfirmAction(open ? (confirmAction ?? 'job') : null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          isPending={isPending}
          onConfirm={handleConfirm}
        />
      </>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant={variant} disabled={isPending} className={triggerClass}>
            <Trash2 className={iconClass} />
            {label}
            <ChevronDown className={cn(iconClass, 'opacity-70')} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            onClick={() => setConfirmAction('job')}
            className="flex-col items-start gap-0"
          >
            <span>Remove Job Only</span>
            <span className="text-xs text-muted-foreground">
              The scheduler keeps creating new jobs
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmAction('scheduler')}
            className="flex-col items-start gap-0 text-status-danger focus:bg-status-danger/10 focus:text-status-danger"
          >
            <span>Remove Job & Stop Scheduler</span>
            <span className="text-xs text-muted-foreground">Permanently stops scheduled runs</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <JobRemoveConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => setConfirmAction(open ? (confirmAction ?? 'job') : null)}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        isPending={isPending}
        onConfirm={handleConfirm}
      />
    </>
  )
}

interface JobRemoveConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  isPending: boolean
  onConfirm: () => void
}

function JobRemoveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  isPending,
  onConfirm,
}: JobRemoveConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

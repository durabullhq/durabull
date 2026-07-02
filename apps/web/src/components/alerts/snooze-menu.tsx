import { Moon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatAlertDate } from '@/components/alerts/alert-primitives'
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
import { Select } from '@/components/ui/select'
import { type AlertRuleRecord, useSnoozeAlertRule, useUnsnoozeAlertRule } from '@/hooks/use-alerts'

/** Server-enforced snooze ceiling: 7 days. */
const MAX_SNOOZE_MINUTES = 10_080

const SNOOZE_PRESETS = [
  { label: 'Snooze 1 hour', minutes: 60 },
  { label: 'Snooze 24 hours', minutes: 1_440 },
  { label: 'Snooze 7 days', minutes: 10_080 },
] as const

type SnoozeUnit = 'minutes' | 'hours' | 'days'

const UNIT_MINUTES: Record<SnoozeUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1_440,
}

export function SnoozeMenu({
  rule,
  connectionId,
  disabled = false,
}: {
  rule: AlertRuleRecord
  connectionId: string
  disabled?: boolean
}) {
  const snoozeRuleMutation = useSnoozeAlertRule(connectionId)
  const unsnoozeRuleMutation = useUnsnoozeAlertRule(connectionId)
  const [customOpen, setCustomOpen] = useState(false)
  const [customAmount, setCustomAmount] = useState('2')
  const [customUnit, setCustomUnit] = useState<SnoozeUnit>('hours')
  const [customError, setCustomError] = useState<string | null>(null)

  const isBusy = snoozeRuleMutation.isPending || unsnoozeRuleMutation.isPending

  async function handleSnooze(minutes: number) {
    try {
      const result = await snoozeRuleMutation.mutateAsync({ ruleId: rule.id, minutes })
      toast.success(`Rule snoozed until ${formatAlertDate(result.rule.mutedUntil)}`, {
        description: `${rule.name} pauses checks temporarily — open incidents stay until it wakes.`,
      })
      return true
    } catch (error) {
      toast.error('Failed to snooze rule', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
      return false
    }
  }

  async function handleUnsnooze() {
    try {
      await unsnoozeRuleMutation.mutateAsync(rule.id)
      toast.success('Rule unsnoozed', {
        description: `${rule.name} resumes checks on the next poll.`,
      })
    } catch (error) {
      toast.error('Failed to unsnooze rule', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      })
    }
  }

  async function handleCustomConfirm() {
    const amount = /^\d+$/.test(customAmount.trim())
      ? Number.parseInt(customAmount.trim(), 10)
      : null
    const minutes = amount === null ? null : amount * UNIT_MINUTES[customUnit]

    if (!minutes || minutes < 1 || minutes > MAX_SNOOZE_MINUTES) {
      setCustomError('Choose a duration between 1 minute and 7 days.')
      return
    }

    setCustomError(null)
    const succeeded = await handleSnooze(minutes)
    if (succeeded) setCustomOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || isBusy}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Snooze options for ${rule.name}`}
          >
            <Moon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {SNOOZE_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.minutes}
              onClick={() => void handleSnooze(preset.minutes)}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => {
              setCustomError(null)
              setCustomOpen(true)
            }}
          >
            Custom…
          </DropdownMenuItem>
          {rule.state === 'snoozed' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleUnsnooze()}>Unsnooze</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-sm" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Custom snooze</DialogTitle>
            <DialogDescription>
              Silence checks for {rule.name} temporarily — open incidents stay until it wakes. Up to
              7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="space-y-2">
              <Label htmlFor="snooze-custom-amount">Duration</Label>
              <Input
                id="snooze-custom-amount"
                inputMode="numeric"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                aria-invalid={customError ? true : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snooze-custom-unit">Unit</Label>
              <Select
                id="snooze-custom-unit"
                value={customUnit}
                onChange={(event) => setCustomUnit(event.target.value as SnoozeUnit)}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </Select>
            </div>
          </div>
          {customError ? <p className="text-sm text-destructive">{customError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCustomConfirm()}
              disabled={snoozeRuleMutation.isPending}
            >
              {snoozeRuleMutation.isPending ? 'Snoozing...' : 'Snooze'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

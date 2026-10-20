'use client'

import { useState } from 'react'
import { inngestExecutions, TRIGGER_SMALL_1X, triggerUsage } from '@/lib/compare/cost-model'
import { REVIEWED_LABEL } from '@/lib/compare/editorial'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
const number = new Intl.NumberFormat('en-US')
export function CostCalculator({ mode }: { mode: 'trigger' | 'inngest' }) {
  const [runs, setRuns] = useState('1000000')
  const [factor, setFactor] = useState(mode === 'trigger' ? '10' : '5')
  const runCount = Number(runs)
  const multiplier = Number(factor)
  const valid =
    runs.trim() !== '' &&
    factor.trim() !== '' &&
    Number.isFinite(runCount) &&
    Number.isFinite(multiplier) &&
    runCount >= 0 &&
    runCount <= 1e9 &&
    Number.isInteger(runCount) &&
    multiplier >= 0 &&
    multiplier <= (mode === 'trigger' ? 86400 : 1000) &&
    (mode === 'trigger' || Number.isInteger(multiplier))
  const usage = triggerUsage(runCount, multiplier)
  const total = mode === 'trigger' ? usage.total : inngestExecutions(runCount, multiplier)
  return (
    <section
      className="cost-calculator"
      aria-label={
        mode === 'trigger' ? 'Trigger.dev usage calculator' : 'Inngest execution calculator'
      }
    >
      <h2>
        {mode === 'trigger'
          ? 'Model the work, then price it.'
          : 'How many executions is your workload?'}
      </h2>
      <p className="calculator-caption">
        {mode === 'trigger'
          ? `small-1x · $${TRIGGER_SMALL_1X.perSecond} per executing second + $${TRIGGER_SMALL_1X.perRun} per run`
          : 'Executions = function runs × (steps per run + 1)'}
      </p>
      <div className="calculator-inputs">
        <label>
          {mode === 'trigger' ? 'Monthly runs' : 'Monthly function runs'}
          <input
            type="number"
            min="0"
            max="1000000000"
            step="1"
            value={runs}
            onChange={(e) => setRuns(e.target.value)}
          />
        </label>
        <label>
          {mode === 'trigger' ? 'Executing seconds per run' : 'Steps per run'}
          <input
            type="number"
            min="0"
            max={mode === 'trigger' ? '86400' : '1000'}
            step={mode === 'trigger' ? 'any' : '1'}
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          />
        </label>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {valid ? (
          <>
            <output className="calculator-total">
              {mode === 'trigger' ? money.format(total) : number.format(total)}
            </output>
            <p className="calculator-caption">
              {mode === 'trigger'
                ? 'Monthly usage estimate before plan credits, add-ons, and taxes.'
                : 'Billable executions under this simplified model, before retries or extra steps.'}
            </p>
          </>
        ) : (
          <p className="calculator-caption">
            Enter 0–1 billion whole runs and{' '}
            {mode === 'trigger' ? '0–86,400 seconds' : '0–1,000 whole steps'} per run.
          </p>
        )}
      </div>
      {valid && mode === 'trigger' ? (
        <div className="calculator-bars">
          {[
            { label: 'Compute', value: usage.compute },
            { label: 'Invocations', value: usage.invocation },
          ].map((row) => (
            <div className="calculator-row" key={row.label}>
              <div>
                <span>{row.label}</span>
                <span>{money.format(row.value)}</span>
              </div>
              <div className="calculator-track" aria-hidden>
                <div style={{ width: `${total > 0 ? (row.value / total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <p className="calculator-caption">
        {mode === 'trigger'
          ? 'Assumes every run uses small-1x for the same executing duration. Checkpointed waits are excluded. This is not an invoice or a comparison with your BullMQ infrastructure bill. Validate concurrency separately.'
          : 'A function run counts once, plus each step. A million five-step runs are six million executions. This models usage, not an overage quote; consult current tier pricing.'}{' '}
        <a
          href={
            mode === 'trigger' ? 'https://trigger.dev/pricing' : 'https://www.inngest.com/pricing'
          }
          className="underline underline-offset-4"
        >
          Official pricing ↗
        </a>{' '}
        · Reviewed {REVIEWED_LABEL}.
      </p>
    </section>
  )
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { RetryJobDialog } from '@/components/retry-job-dialog'
import { Button } from '@/components/ui/button'
import { useJobRetryDialog } from '@/hooks/use-job-retry-dialog'
import { payload } from '../fixtures/data'

function RetryFlow() {
  const retry = useJobRetryDialog('email:receipts', 'job-1042')
  return (
    <>
      <Button onClick={retry.openDialog}>Retry demo job</Button>
      <RetryJobDialog
        queueName="email:receipts"
        jobId="job-1042"
        jobName="send-receipt"
        jobData={payload}
        retry={retry}
      />
    </>
  )
}
const meta = { title: 'Web Components/Retry Job Flow', component: RetryFlow } satisfies Meta<
  typeof RetryFlow
>
export default meta
export const ReviewAndProgress: StoryObj<typeof meta> = {}

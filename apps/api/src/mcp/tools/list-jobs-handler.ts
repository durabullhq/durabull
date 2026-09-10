import type { ListJobsHandlerInput, ListJobsHandlerOutput, McpJobState } from '@durabull/mcp'
import { MCP_JOB_STATES } from '@durabull/mcp'
import type { JobType } from 'bullmq'
import { toRedisConnectionOptions } from '../../lib/connection-options'
import { getQueue } from '../../lib/redis'
import {
  decodeCursor,
  encodeCursor,
  McpToolError,
  requireConnectionForPrincipal,
  toMcpJobSummary,
} from './shared'

const FILTER_SCAN_BATCH_SIZE = 200
const MAX_FILTER_SCAN_JOBS = 10_000

function emptyPage(connectionId: string, queueName: string): ListJobsHandlerOutput {
  return { connectionId, queueName, jobs: [], total: 0, nextCursor: null }
}

export async function listJobsHandler(input: ListJobsHandlerInput): Promise<ListJobsHandlerOutput> {
  const connection = await requireConnectionForPrincipal(input.principal, input.connectionId)

  if (input.status && !(MCP_JOB_STATES as readonly string[]).includes(input.status)) {
    throw new McpToolError(
      'validation_error',
      `Unknown job status "${input.status}". Expected one of: ${MCP_JOB_STATES.join(', ')}.`
    )
  }

  const queue = await getQueue(
    connection.id,
    connection.url,
    input.queueName,
    connection.prefix,
    toRedisConnectionOptions(connection.allowSelfSignedCerts)
  )

  if (input.jobId) {
    const exactJob = await queue.getJob(input.jobId)
    if (!exactJob) {
      return emptyPage(connection.id, input.queueName)
    }
    const exactState = await exactJob.getState()
    if (input.status && exactState !== input.status) {
      return emptyPage(connection.id, input.queueName)
    }
    if (input.name && !exactJob.name.toLowerCase().includes(input.name.toLowerCase())) {
      return emptyPage(connection.id, input.queueName)
    }
    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobs: [toMcpJobSummary(exactJob, exactState)],
      total: 1,
      nextCursor: null,
    }
  }

  const states: McpJobState[] = input.status ? [input.status] : [...MCP_JOB_STATES]
  const bullStates = states as JobType[]
  const hasClientFilter = Boolean(input.name)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const offset = decodeCursor(input.cursor)

  if (hasClientFilter) {
    let scannedJobs = 0
    const jobsWithState: Array<{
      job: NonNullable<Awaited<ReturnType<typeof queue.getJobs>>[number]>
      state: McpJobState
    }> = []
    for (const state of states) {
      for (let start = 0; ; start += FILTER_SCAN_BATCH_SIZE) {
        const end = start + FILTER_SCAN_BATCH_SIZE - 1
        const stateJobs = await queue.getJobs([state as JobType], start, end)
        if (stateJobs.length === 0) {
          break
        }

        for (const job of stateJobs) {
          if (job == null) continue

          scannedJobs += 1
          if (scannedJobs > MAX_FILTER_SCAN_JOBS) {
            throw new McpToolError(
              'validation_error',
              `Filtered job search exceeded ${MAX_FILTER_SCAN_JOBS} jobs. Narrow the query with status or jobId.`
            )
          }

          jobsWithState.push({ job, state })
        }
      }
    }
    const needle = input.name!.toLowerCase()
    const filtered = jobsWithState
      .filter(({ job }) => job.name.toLowerCase().includes(needle))
      .map(({ job, state }) => toMcpJobSummary(job, state))

    const page = filtered.slice(offset, offset + pageSize)
    const nextOffset = offset + pageSize
    return {
      connectionId: connection.id,
      queueName: input.queueName,
      jobs: page,
      total: filtered.length,
      nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
    }
  }

  const end = offset + pageSize - 1

  const jobs = await queue.getJobs(bullStates, offset, end)
  const mappedJobs = await Promise.all(
    jobs
      .filter((job): job is NonNullable<typeof job> => job != null)
      .map(async (job) => toMcpJobSummary(job, await job.getState()))
  )

  const total = await queue.getJobCountByTypes(...bullStates)
  const nextOffset = offset + pageSize
  return {
    connectionId: connection.id,
    queueName: input.queueName,
    jobs: mappedJobs,
    total,
    nextCursor: nextOffset < total ? encodeCursor(nextOffset) : null,
  }
}

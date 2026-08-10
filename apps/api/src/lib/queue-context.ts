import type { Context } from 'hono'
import { getConnectionRedisOptions } from './connection-options'
import { getQueue } from './redis'

export function getQueueFromContext(c: Context, queueName: string) {
  return getQueue(
    c.get('connectionId'),
    c.get('connectionUrl'),
    queueName,
    c.get('connectionPrefix'),
    getConnectionRedisOptions(c)
  )
}

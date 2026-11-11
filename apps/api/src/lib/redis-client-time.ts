/**
 * Redis `CLIENT LIST` reports a connection's `age` and `idle` in whole seconds.
 * Durabull's metrics and MCP responses expose them as `ageMs` / `idleMs`, so the
 * conversion happens once, here, rather than in each consumer.
 */
export function redisClientSecondsToMs(value: string | number | null | undefined): number {
  const seconds = Number(value ?? 0)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0
}

/** A Redis client (a BullMQ worker or queue-events listener) with its times in milliseconds. */
export interface RedisClientSummary {
  id: string
  name: string
  address: string
  ageMs: number
  idleMs: number
}

/** Maps one `CLIENT LIST` entry, as BullMQ returns it from `getWorkers()`, to a summary. */
export function toRedisClientSummary(
  client: Record<string, string | undefined>
): RedisClientSummary {
  return {
    id: client.id ?? '',
    name: client.name ?? '',
    address: client.addr ?? '',
    ageMs: redisClientSecondsToMs(client.age),
    idleMs: redisClientSecondsToMs(client.idle),
  }
}

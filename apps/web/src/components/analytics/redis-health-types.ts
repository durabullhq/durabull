import type { api, InferResponseType } from '@/lib/api'

type RedisHealthEndpoint = (typeof api.c)[':connectionId']['metrics']['redis-health']['$get']

export type RedisHealthHistoryResponse = InferResponseType<RedisHealthEndpoint, 200>
export type RedisHealthHistoryPoint = RedisHealthHistoryResponse['series'][number]

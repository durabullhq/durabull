/** Per-process burst capacity and sustained refill, tuned for paginated agent workflows. */
export const MCP_RATE_LIMIT_POLICIES = {
  ingress: { capacity: 600, refillPerSecond: 20 },
  discovery: { capacity: 120, refillPerSecond: 10 },
  read: { capacity: 180, refillPerSecond: 6 },
  heavy: { capacity: 90, refillPerSecond: 3 },
  write: { capacity: 30, refillPerSecond: 1 },
} as const

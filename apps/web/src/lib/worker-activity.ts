/**
 * How the Workers page decides whether a worker is active or idle.
 *
 * The workers endpoint passes Redis `CLIENT LIST` `idle` through unchanged, and
 * Redis reports it in whole SECONDS — how long the worker's connection has gone
 * without issuing a command.
 *
 * A healthy worker waiting for jobs re-issues its blocking pop at most every 10
 * seconds (BullMQ's maximum block timeout), so the threshold has to sit well
 * above that or waiting workers flap between the two states. Sixty seconds does,
 * and matches the Stale band on the analytics page.
 *
 * Known limit: this measures connection quietness, not work. A worker with
 * concurrency 1 that runs a single job for longer than the threshold issues no
 * commands meanwhile and reads as idle while it is busy.
 */
export const WORKER_IDLE_AFTER_SECONDS = 60

/** True while the worker's Redis connection has been quiet for no longer than the threshold. */
export function isWorkerActive(idleSeconds: number): boolean {
  return idleSeconds <= WORKER_IDLE_AFTER_SECONDS
}

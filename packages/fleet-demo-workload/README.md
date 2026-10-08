# Fleet Demo Workload

24/7 BullMQ workload generator and processor for Durabull Fleet Analytics demos.

## What it does

- Runs continuously and produces/consumes jobs across multiple ecommerce queues.
- Uses 1 logical connection.
- Injects low-rate random failures plus intermittent incident windows.
- Enables BullMQ native metrics on every worker (`metrics.maxDataPoints`).
- Retains a bounded number of completed jobs, failed jobs, events, metrics, and per-job log entries.
- Upserts 38 scheduled jobs across 9 queues using realistic cron patterns.

## Queue set

- `user-welcome`
- `cart-recovery`
- `order-processing`
- `payment-processing`
- `shipment-processing`
- `inventory-sync`
- `refund-processing`
- `return-processing`
- `fraud-review`

## Environment variables

The workload runs against one Redis URL.

```bash
# Primary Redis URL for the fleet workload
WORKLOAD_REDIS_URL=redis://localhost:6379

# Optional runtime tuning
WORKLOAD_COMPLETED_JOB_RETENTION=25
WORKLOAD_FAILED_JOB_RETENTION=50
WORKLOAD_JOB_LOG_RETENTION=6
WORKLOAD_EVENT_STREAM_MAX_LEN=500
WORKLOAD_METRICS_MAX_DATA_POINTS=1440
WORKLOAD_HEARTBEAT_MS=60000
WORKLOAD_LOG_LEVEL=info
# Reset known demo queues on startup. Defaults to true for this disposable workload.
WORKLOAD_RESET_ON_BOOT=true
# Optional: namespace queues when sharing Redis with other Bull workloads
# WORKLOAD_NAMESPACE_QUEUES=true
```

Notes:

- By default, queue names remain generic (`user-welcome`, `order-processing`, etc.).
- Enable `WORKLOAD_NAMESPACE_QUEUES=true` if this workload shares Redis with other Bull workloads and you need strict isolation.
- Startup resets this workload's known queue keys by default, then trims retained BullMQ data to the configured limits before scheduled jobs are upserted. Set `WORKLOAD_RESET_ON_BOOT=false` to keep queue history between restarts.
- Use the complete Redis URL supplied by your hosting provider, including its credentials, database number, and TLS scheme. Apply environment changes to the workload service before restarting it.

## Run

```bash
bun run --filter @durabull/fleet-demo-workload start
```

or:

```bash
cd packages/fleet-demo-workload
bun run start
```

## Development

```bash
cd packages/fleet-demo-workload
bun run dev
```

Prerequisites:

- Redis reachable at `WORKLOAD_REDIS_URL`; if unset, the workload uses `REDIS_URL`, then `redis://127.0.0.1:6379`.
- Use a disposable Redis database: startup resets known demo queues by default. Namespacing avoids collisions but is not a separate database or access boundary.
- If you start Durabull with root `bun run dev`, this workload is not included by default.
  Use `bun run workload:dev` or `bun run dev:demo` from the repo root when you want it.

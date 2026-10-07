---
name: job-recovery
description: Perform a user-requested BullMQ job retry, promotion, queue pause/resume, or alert acknowledgement/resolution/snooze through Durabull, then verify the result.
---

Resolve the exact connection, queue, job or alert before acting. Discover IDs through the tools; do not derive an ID from a display name. Read the relevant job, queue or alert and confirm its current state supports the requested operation.

A clear user instruction authorizes that specific action; do not ask again just because it changes state. If the request is ambiguous about environment, target, or breadth, clarify the missing part. Diagnosis alone never authorizes recovery. For a retry, mention any known downstream side effects in the diagnosis; retrying a job may repeat work in external systems.

Use only the narrow matching tool: `retry_job`, `promote_job`, `pause_queue`, `resume_queue`, `acknowledge_alert_event`, `unacknowledge_alert_event`, `resolve_alert_event`, `snooze_alert_rule`, or `unsnooze_alert_rule`. Each needs a dedicated write scope. Acknowledge is delegated-user only. Do not change payloads, remove jobs, purge queues or create/edit schedules; these operations are intentionally absent.

After the call, read the target again and report the observed state. A retry being queued does not prove the job succeeded. On timeout or uncertain delivery, inspect state before attempting another mutation. Stop on `conflict`, explain the state, and propose a next step instead of repeatedly retrying. Use host OAuth reauthorization for `insufficient_scope`; do not bypass a tenant or service-account policy denial.

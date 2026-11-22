# @vercel-internals/local-schedules

## 0.0.4

### Patch Changes

- 882c16f: fix delivery type narrowing in the schedule broker test.

## 0.0.3

### Patch Changes

- ce781dc: Match hosted schedule and execution IDs in local development. Generate ULID-based schedule IDs and deterministic execution IDs from the schedule ID and nominal timestamp, while continuing to dispatch repeated manual invocations at the same millisecond.

## 0.0.2

### Patch Changes

- c7a92e3: Run authored and builder-native static schedules in local development. Validate complete snapshots before publishing function and queue registrations and preserve the last valid snapshot on invalid reloads. Static definitions reject `payload`; function callbacks receive only schedule metadata through bodyless events using `ce-id` and `ce-vssscheduledat`. Queue deliveries include `executionId` and `scheduledAt` and retain API-managed payloads. Local schedules and management state are in memory and reset on a full dev-server restart.

  The combined authored and native schedule definitions form one full source snapshot. Changing any schedule definition reapplies all static definitions, as a deployment would, while preserving retained schedules' IDs, disabled state, and API-managed payloads. Unchanged source snapshots and unrelated code or environment reloads preserve API edits, deletions, and same-name dynamic replacements without revalidating core timing or ownership. A changed source snapshot that conflicts with a dynamic schedule is rejected without replacing the accepted registries.

## 0.0.1

### Patch Changes

- 57aeab5: Add an explicitly started, project-scoped local Schedules broker with timezone-aware timers and an isolated dispatch boundary.
- 62d909b: Match production schedule name and namespace validation by allowing leading periods, underscores, and hyphens. Preserve the 1-256 character limit and rejection of slashes. This parity fix accompanies local Schedules API hosting without changing scheduler behavior.

# Local Schedules

A project-scoped, in-memory Schedules engine for local development. It manages
schedule definitions, calculates timezone-aware occurrences, and hands deliveries
to a dispatcher supplied by the host application.

This is a private internal package. Consumers should add it as a devDependency and
bundle it into their application. The host owns HTTP routing, target discovery,
process supervision, and delivery to functions or Queue consumers.

## Usage

Create one broker per project and track, and provide a dispatcher that handles
deliveries and honors their abort signals:

```ts
import { ScheduleBroker } from '@vercel-internals/local-schedules';

const broker = new ScheduleBroker({
  ownerId: 'team_local',
  projectId: 'prj_local',
  trackId: 'production',
  dispatch: invocation => localDispatcher.dispatch(invocation),
  onError: (error, invocation) => {
    console.error(`Schedule ${invocation.schedule.name} failed`, error);
  },
});

broker.create({
  name: 'hourly-cleanup',
  expression: { type: 'cron', cron: '0 * * * *' },
  timezone: 'UTC',
  target: { type: 'queue', topic: 'cleanup' },
  payload: { keepDays: 30 },
});

broker.start();

// Trigger an occurrence without waiting for the next scheduled time.
await broker.invoke({ name: 'hourly-cleanup' });

// On application shutdown, cancel pending work and drain active dispatches.
await broker.close();
```

Importing, constructing, or registering schedules does not start timers. Call
`start()` explicitly. Manual invocation also works before startup and while a
schedule is inactive.

## Managing schedules

Each broker has an immutable owner, project, and track. Within that scope,
`(namespace, name)` uniquely identifies a schedule. The default namespace is
`default`.

| Method                               | Behavior                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `create(input)`                      | Creates an active dynamic schedule. Generates a name when omitted.       |
| `list({ namespace, limit, cursor })` | Returns `{ data, cursor }`. The default limit is 20; the maximum is 100. |
| `get(identifier)`                    | Returns a resource snapshot without its payload.                         |
| `update(identifier, changes)`        | Updates a dynamic definition. Null jitter or payload clears that field.  |
| `delete(identifier)`                 | Cancels and removes a dynamic schedule, returning `{ scheduleId }`.      |
| `enable(identifier, { until })`      | Activates a schedule, optionally only until `until` (Unix ms).           |
| `disable(identifier)`                | Deactivates a schedule; repeated calls are idempotent.                   |
| `invoke(identifier)`                 | Dispatches immediately, bypassing inactive state and jitter.             |

Dynamic creation and management target updates accept `{ type: 'queue', topic }`.
Payloads must be JSON serializable. Names and namespaces start with a letter or
number and contain only letters, numbers, and `. _ -`.

Errors are `ScheduleBrokerError`s whose `code` matches the hosted Schedules API
where one exists, such as `static_schedule`, `schedule_type_change_not_allowed`,
`schedule_single_at_passed`, `schedule_already_active`, `single_at_in_past`,
`active_until_in_past`, `invalid_cron_expression`, and `jitter_exceeds_cadence`.
Static schedules cannot be updated or deleted, only enabled or disabled. An update
cannot change a schedule between cron and single-fire.

### Time-bounded activation

`enable(identifier, { until })` keeps a schedule active until `until`, then
disables it again and removes `activeUntil`. An expired activation reads as
inactive even before the broker is started. `until` must be in the future. It
replaces an existing `activeUntil`, but cannot be added to a schedule that is
already active without one. Enabling without `until` or disabling clears
`activeUntil`. Resource reads return detached snapshots, and
list cursors are opaque and scoped to the project, track, and namespace.

New schedules receive an ID with the `sch_` prefix followed by a 26-character
ULID, matching the hosted service. Updates and static reconciliation preserve
existing IDs. Deleting and recreating a schedule generates a new ID.

### Static schedules

Use `reconcileStatic(definitions)` to register a complete snapshot of static
schedules across namespaces. Static definitions can target queues or functions
using `{ type: 'function', function: 'api/task' }`.

Static definitions cannot include `payload`. The broker rejects that field at
runtime, including explicit `null` or `undefined`, before changing the registry.
Queue deliveries include stored payloads; function and path deliveries never
include them.

Reconciliation preserves schedule IDs and active/inactive state, removes only
static entries, and leaves unchanged occurrences pending. Invalid definitions,
duplicate keys, or collisions with dynamic schedules reject the entire snapshot
without changing the registry.

## Dispatching occurrences

The injected `dispatch(invocation)` receives a schedule snapshot, an
`occurrenceId`, nominal `scheduledAt` time, `invokeSource` (`scheduled` or `manual`),
an abort `signal`, and a `delivery`:

- **Function deliveries** contain the target and binary CloudEvent headers, with
  no body or content-type header. The event type is `com.vercel.schedule.v1beta`,
  and `ce-vssexpression` carries the cron expression or single-fire datetime.
- **Path deliveries** contain the path, request method, and the same CloudEvent
  headers plus the legacy Cron Job `user-agent: vercel-cron/1.0` and, for cron
  schedules, `x-vercel-cron-schedule`. The host adds `authorization` from
  `CRON_SECRET`.
- **Queue deliveries** contain the topic and a message with `scheduleId`,
  `executionId`, `name`, `namespace`, `scheduledAt`, `expression`, `source`, and
  optional `payload`.

These match the hosted dispatcher and the
[schedule dispatch protocol](https://github.com/vercel/schedules/blob/main/docs/schedule-dispatch-protocol.md).

Occurrence IDs use the hosted service's deterministic `schx_` format. Both scheduled
and manual invocations hash `${scheduleId}:${scheduledAtMs}` with SHA-256 and encode
the first 16 bytes as 26 Crockford Base32 digits. Scheduled invocations use nominal
time, not the jittered or delayed delivery time. Manual invocations use the current
clock time. Invocations of the same schedule at the same millisecond share an ID,
including repeated manual calls, but the broker still dispatches every manual call.
Function `ce-vssscheduledat` and Queue `scheduledAt` represent nominal time, even if
delivery starts late. Queue `executionId` and function `ce-id` carry the invocation's
`occurrenceId` so consumers can identify duplicate deliveries.
The broker does not emit the legacy Queue `firedAt`, function `ce-time`, or
function `ce-vssscheduleexecutionid` fields.

The dispatcher owns target resolution, authentication, concurrency limits, and
delivery retries. Retries must reuse the occurrence ID. Check `signal` before
submitting work and honor cancellation during dispatch. Cancellation cannot undo
work already accepted by a target.

The broker does not retry failed deliveries. Automatic failures go to `onError`,
which must be synchronous. Exceptions thrown by this observer are contained so
they cannot disrupt scheduling. Manual failures reject `invoke()`.
An HTTP adapter is also responsible for request validation, authentication,
payload size limits, quotas, and HTTP response mapping.

## Scheduling behavior

### Expressions and timezones

- **Cron:** numeric five-field minute/hour/day/month/weekday expressions with
  wildcards, lists, ranges, and steps. Sunday is `0`; one of day-of-month or
  day-of-week must be `*`. Seconds, years, aliases, named days/months, and extended
  operators such as `?`, `L`, `W`, `#`, and `H` are unsupported.
- **Single-fire:** `{ type: 'single', at: '2026-12-01T09:00' }`. The timestamp
  has minute precision and no timezone suffix or offset; `:00` seconds are
  accepted, and the time is stored as `YYYY-MM-DDTHH:mm:00`. Creating, or
  changing the expression or timezone to, a time more than 15 seconds in the past
  is rejected. A time within that grace period fires immediately.
- **Timezone:** an IANA timezone, defaulting to UTC, independent of the host's
  timezone. Cron skips nonexistent daylight-saving times and uses the first
  occurrence of repeated times. Ambiguous or nonexistent single-fire times are
  rejected.
- **Jitter:** an optional integer from 1 to 15 minutes, no greater than the cron's
  minimum wall-clock cadence. Each occurrence gets one uniformly sampled delay
  in whole seconds relative to nominal time, from zero through the jitter window
  minus its last 10 seconds, like the hosted dispatcher.

Jitter validation matches the hosted service's
[`getMinimumCronCadenceMinutes`](https://github.com/vercel/api/blob/cc0ea1cc3d24655a59cf1ad2ce0f73c839df372b/packages/schedules/src/cron-minimum-cadence-minutes.ts#L6-L51):
it compares cron wall-clock slots without adjusting for daylight-saving offset
changes. A daily slot has a 1440-minute cadence even on a 23-hour day. Timezone
still determines actual firing times; this describes existing validation behavior,
not a required change to hosted scheduling.

### Timing and missed occurrences

The broker uses an unref'd timer with a maximum delay of 60 seconds and rechecks
wall time on every wake. Long delays are not accelerated or passed directly to
Node's bounded timeout API.

After sleep or a forward clock jump, already-pending occurrences and the previously
armed next occurrence are delivered once, unless they have expired. The next cron
occurrence is then calculated after the current time; the entire missed interval
is not replayed. As in the hosted dispatcher, a cron occurrence expires once its
jitter window (one minute when unset) plus the cron's minimum cadence, at least
10 minutes, has passed. Single-fire occurrences and crons with a fixed day of month
or month never expire.
Backward clock changes neither fire schedules early nor replay cron occurrences
already materialized, including across state and configuration changes.

Independent occurrences may overlap. Handler duration does not shift cron cadence.
Disabled intervals are not backfilled when a schedule is enabled.

### Single-fire completion

Once a single-fire schedule's time arrives, it can no longer be updated, enabled,
or disabled, and it can be deleted only while inactive. These requests fail with
`schedule_single_at_passed`, as in the hosted service. The resource and its state
are retained until the broker closes. Manual invocation still works and does not
consume the automatic occurrence.

Static reconciliation never rearms an already-materialized occurrence, including
one canceled before dispatch starts. A single-fire occurrence already armed before
sleep still fires once on wake.

## Shutdown and restart

Deleting, disabling, replacing, or removing a static definition cancels its pending
work and aborts active dispatches. `close()` does this for the entire broker and
waits for dispatch promises to settle. Dispatchers must honor abort signals so
shutdown can complete.

Closing is terminal and repeatable. A new broker starts with an empty registry;
the host must register static definitions again. Dynamic schedules are not
persisted, and downtime is not replayed. These local lifecycle and delivery
policies do not guarantee identical behavior to the hosted service.

## Development

```sh
pnpm --filter @vercel-internals/local-schedules test-unit
pnpm --filter @vercel-internals/local-schedules type-check
pnpm --filter @vercel-internals/local-schedules build
```

Tests use controlled clocks and timers, with no cloud calls or real-time sleeps.
The optional `now()` and `random()` constructor options support deterministic
testing; `random()` must return a value in `[0, 1)`.

# Implementation Plan: `vc logs --follow` via request-logs

## Goal

Drop the single-deployment requirement for `vercel logs --follow` so users can stream live request logs across a project with the same filters as historical logs:

```bash
vercel logs --follow --environment preview
vercel logs --follow --no-branch
vercel logs --follow --branch feature-x
vercel logs --follow --deployment dpl_xxx   # still supported
```

## Locked decisions

1. **Backend:** `--follow` always polls `GET https://vercel.com/api/logs/request-logs` (live mode). It does **not** use `/runtime-logs`.
2. **Poll interval:** 2 seconds (dashboard live default).
3. **CLI-only for v1:** No `api` / `front` changes required. ClickHouse and request-logs already treat `deploymentId` as optional; live mode is `endDate` omitted.
4. **Human output:** Append-only lifecycle with `[id]` prefixes (last 4 of `requestId`, lengthened on collision):
   - `Request started` (full method/path/host details; status `---` until finished)
   - Log blocks (summary + separator + message)
   - `Request finished (Nms)` with final status
   - No “waiting for response” lines
5. **`--json` (follow only):** Typed NDJSON event stream (`request_started` / `log` / `request_finished`). Historical non-follow `--json` stays as one `RequestLogEntry` per request.

## Behavior matrix

| Invocation | Scope |
|---|---|
| `vc logs --follow` | Linked project; auto branch filter when in a git repo |
| `vc logs --follow --no-branch` | Linked project; all branches |
| `vc logs --follow --environment preview` | All matching preview requests |
| `vc logs --follow --branch X` | Requests on branch X |
| `vc logs --follow dpl_…` / URL | Single deployment via `deploymentId` filter |
| `vc logs` (no `--follow`) | Historical request-logs (unchanged) |

Incompatible with `--follow` (unchanged): `--level`, `--status-code`, `--source`, `--since`, `--until`, `--limit`, `--query`, `--search`, `--request-id`.

## Architecture

```
logs/index.ts
  └─ followRequestLogs (util/logs-follow.ts)
       └─ fetchRequestLogs (util/logs-v2.ts)  // live: true → omit endDate
            └─ GET /api/logs/request-logs
```

### Poller (`logs-follow.ts`)

- Lookback: 10s on start; cursor advances with 5s overlap so late-settling rows are not missed.
- State machine (`processFollowRows`): per-`requestId` track emitted log count + finished flag.
- Settled = `requestDurationMs` is present (incomplete live rows omit it / use `-1` upstream).
- Human/JSON formatters share the same event objects.

### Client (`logs-v2.ts`)

- Map `requestDurationMs` and `eventsCount`.
- Support absolute `startDate` / `endDate`.
- `live: true` omits `endDate` so the API includes in-progress requests.

## Output contracts

### Human (follow)

```text
[a1b2] 15:42:05.02  ℹ️  POST  ---  host  ƒ  /api/checkout  Request started
[a1b2] 15:42:05.10  ℹ️  POST  ---  host  ƒ  /api/checkout
[a1b2] --------------------------------------------------------------------------------
[a1b2] creating payment intent
[a1b2] 15:42:05.91  🚫  POST  402  host  ƒ  /api/checkout  Request finished (890ms)
```

### JSON (follow)

```json
{"type":"request_started","requestId":"…","deploymentId":"…","projectId":"…","environment":"preview",…}
{"type":"log","requestId":"…","message":"…",…}
{"type":"request_finished","requestId":"…","responseStatusCode":402,"durationMs":890,…}
```

**Breaking:** previous `--follow --json` passed through raw `RuntimeLog` rows. Consumers must switch to the typed lifecycle events.

## Implementation steps

1. Extend `logs-v2` with duration/live fields.
2. Add `logs-follow` poller + formatters + unit tests.
3. Wire `logs/index.ts` follow path; update help/examples.
4. Rewrite command tests off `/runtime-logs` / deployment resolution.
5. Ship this plan doc + changeset.

## Risks

- **Breaking `--follow --json` shape** — intentional; document in changeset.
- **Polling cost** — 2s cadence matches dashboard; still N requests while the command runs.
- **Prefix collisions** — mitigated by lengthening the `[id]` suffix.
- **Incomplete rows** — rely on live mode + duration settle signal; overlap window covers late updates.

## Success criteria

- `vc logs --follow --environment preview` and `--no-branch` stream without picking a single deployment.
- Deployment URL/ID + `--follow` still works via `deploymentId` filter.
- Human output shows started / log / finished lifecycle with request prefixes.
- `--follow --json` emits typed events; historical `--json` unchanged.
- Unit tests cover poller state machine and command wiring.

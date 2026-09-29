# Portable CLI scenario runner contract

This document is normative. It defines what any runner (the TypeScript runner
in this repository, or a future Go runner for `vercel-labs/vercel-cli-go`) must
implement to execute the generated portable scenarios. A runner needs only an
export of the generated artifacts and this document. It does not need Node or
TypeScript at run time.

The Zod schemas and TS sources in this directory are the only source of truth;
no generated files are checked in. `pnpm scenarios:generate [outDir]` (in
`packages/cli`) exports the artifacts, by default to the gitignored
`generated/`. The TS runner builds the same artifacts in memory.

Format version: `1` (`formatVersion` in every generated file).

## Artifacts

Paths below are relative to the export directory. All files are canonical JSON: object keys are sorted recursively, the indent is
two spaces, and each file ends with a newline. Array order is significant.

| Path                            | Content                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `manifest.json`                 | Scenario and vector index plus a `sha256` for every other file |
| `scenarios/<suite>/<name>.json` | One scenario. Its id is `<suite>/<name>`                       |
| `fake-api-vectors/<name>.json`  | One fake-API conformance vector                                |
| `catalog/operations.json`       | API operations: wire shape and world semantics                 |
| `catalog/faults.json`           | Fault id → replacement error response                          |
| `catalog/errors.json`           | CLI error id → exit code and stderr substrings                 |
| `catalog/capabilities.json`     | Optional capability ids                                        |
| `schema/*.schema.json`          | JSON Schema (draft 2020-12) for each file kind                 |

The manifest has no source commit, so regeneration is stable. Consumers such as
the Go repository run the export at a pinned vercel commit (or vendor its
output) and record that commit.

Scenarios are authored in TypeScript (`cases/`, `vectors/`, `catalog/`,
`authoring/`) and emitted by `generate.ts`. **The generator derives structure,
never answers.** It applies fixtures and defaults, validates references, applies
the authored `worldAfter` merge patch, and canonicalizes. Every outcome, stdout
value, operation log and world patch is written by hand. A runner therefore
only compares; it never simulates CLI logic.

## Scenario file

```jsonc
{
  "formatVersion": 1,
  "id": "whoami/scope-virtual-team",
  "summary": "...",
  "requires": [],            // capability ids
  "world": { "server": {...}, "local": {...} },
  "conditions": { "faults": { "<operation id>": "<fault id>" } },
  "invoke": { "argv": ["whoami", "--format", "json"], "token": "scenario_token" /* or null */ },
  "expect": {
    "outcome": { "kind": "success" },        // or { "kind": "error", "error": "<error id>" }
    "exitCode": 0,
    "stdout": { "kind": "json", "value": {...} },   // or "exact" + value, or "empty"
    "stderrContains": [],
    "operations": { "mode": "exact", "log": [ { "operation": "user.get" } ] },
    "world": { ... }                         // full expected world after the run
  }
}
```

`expect.exitCode` and `expect.stderrContains` are always explicit. The generator
copies them from `catalog/errors.json`, so runners do not need to read that
catalog.

### World

`world.server` holds API entities. All collections are maps keyed by id, so a
merge patch can target one entity.

- `users`: userId → user object. `teams`: teamId → team object. The fake API
  serves these objects **verbatim**. Keep null and absent fields distinct.
- `teamOrder`: the order of teams in `teams.list`. It is a permutation of the
  `teams` keys. It exists because canonical output sorts object keys.
- `memberships`: userId → teamId → `"direct"` or `"virtual"`.
- `apps`: appId → `{clientId, clientName, teamId}`, where `teamId` is the bound
  team.
- `tokens`: token value → `{principal: {kind: "user" | "app", id}}`.

`world.local` is the persisted CLI state. Each key maps to one sandbox file. The
value is the parsed JSON content, or `null` when the file is absent.

| Key           | File                             |
| ------------- | -------------------------------- |
| `credentials` | `global-config/auth.json`        |
| `settings`    | `global-config/config.json`      |
| `projectLink` | `workspace/.vercel/project.json` |
| `repoLink`    | `workspace/.vercel/repo.json`    |

Values use real ids exactly as persisted (for example
`"currentTeam": "team_global"`). Credentials never contain a `refreshToken`.

`expect.world` has the same schema as `world`. It is the input world with the
authored RFC 7386 merge patch already applied. A local key that the patch
removes becomes `null` (file absent).

## Runner invariants

Every runner enforces all of these rules on every scenario.

1. **Sandbox.** Create a fresh directory per scenario with `home/`,
   `global-config/` and `workspace/`. Write each non-null `world.local` value as
   JSON to its file. Do not create files for `null` values.
2. **Fake API.** Start a fresh world-driven fake API on loopback. It serves the
   operations in `catalog/operations.json` from an in-memory copy of
   `world.server` and applies `conditions.faults` (see "Fake API").
3. **Invocation.** Run
   `<cli> <argv...> --api <origin> --global-config <sandbox>/global-config --cwd <sandbox>/workspace`,
   and append `--token <invoke.token>` when `invoke.token` is non-null. When
   the scenario requires `production-origin-routing`, omit `--api <origin>`
   and route the CLI's production origins to the fake API instead (see
   "Catalogs"). Stdin,
   stdout and stderr are not TTYs. Build the environment from scratch:
   - `HOME` and the XDG directories point inside the sandbox;
   - `NO_COLOR=1`, `FORCE_COLOR=0`, `VERCEL_TELEMETRY_DISABLED=1`,
     `NO_UPDATE_NOTIFIER=1`;
   - capability variables (runner-specific);
   - no inherited credentials or proxy variables.
4. **Authorization.** The token in effect is `invoke.token`, or
   `world.local.credentials.token` when `invoke.token` is null.
   - For operations with `auth: "bearer"`: if a token is in effect, every
     request must carry `Authorization: Bearer <token>`. If no token is in
     effect, requests must not carry an Authorization header.
   - Operations with `auth: "form-token"` or `auth: "none"` (OAuth
     introspection and discovery) are exempt. Introspection carries the token
     in its form body, as RFC 7662 specifies.
   - The token must not appear in stdout or stderr.
5. **Assertions.**
   - The exit code equals `expect.exitCode`.
   - stdout matches `expect.stdout`. `exact`: byte-for-byte string equality.
     `empty`: the empty string. `json`: parse stdout and deep-compare. Object
     key order is ignored. Numbers compare exactly: do not round through
     float64 (in Go, use `json.Decoder.UseNumber`).
   - Each `stderrContains` entry is a substring of stderr.
   - The operation log matches `expect.operations` (see "Matching modes").
   - No request was unmodeled (see "Fake API").
   - The actual world after equals `expect.world` exactly. Server state is the
     fake API's in-memory world. Local state is read back from the sandbox:
     - parse each modeled file; a missing file is `null`;
     - strip top-level keys starting with `//` from `auth.json` (the CLI
       writes human comments there);
     - ignore exactly these implementation-private files, which hold random or
       time-based values: `global-config/telemetry-device.json` and
       `global-config/telemetry-session.json`;
     - any other file under `global-config/` or `workspace/` fails the
       scenario (`unmodeledFile`).
6. **Capabilities.** If a scenario `requires` a capability the runner does not
   implement, report the scenario as **skipped** with the capability name.
   Never report it as passed.

Runners may add stricter local checks. For example, the TS runner also fails
on guard violations (non-loopback sockets, child processes).

## Matching modes

The operation log is the ordered list of modeled operations the fake API
served. Each entry is `{operation}`, plus:

- `params` when the catalog lists params. `team.get` records `idOrSlug`, the
  decoded path segment.
- `teamId` when the catalog sets `recordsTeamId`. The value is the `teamId`
  query parameter, or `null` when it is absent. This asserts the CLI's
  `teamId` injection on the wire.

Entries compare as whole JSON values.

- `exact`: the same sequence.
- `unordered`: the same multiset. Used when the CLI issues requests
  concurrently (for example the app-principal cases).
- `subsequence`: the expected entries appear in order within the actual log.
  Extra actual entries are allowed only for operations with `identity: true`.
  Implementations cache identity lookups differently. The Go parity audit
  already excludes them from compared request logs.

## Fake API

Route each request to the catalog operation with the same method and path
pattern (`:name` segments are params). Then apply these steps in order:

1. **Fault.** If `conditions.faults` names the operation, record the log entry
   and respond with the fault's `status` and `body`.
2. **Principal.** Identify the principal as the operation's `auth` says:
   - `bearer`: no Authorization header → `none`. `Bearer <t>` with `t` in
     `world.server.tokens` → that principal (`user` or `app`). Anything else →
     `unknown`.
   - `form-token`: the form body field `token`. Missing or empty → `none`.
     Otherwise look it up as above.
   - `none`: always `none`.
3. **Response.** Look up `responses[<principal kind>]`:
   - missing or `{"kind": "unmodeled"}`: the request is **unmodeled**. Do not
     record it. Respond `404 {"error":{"code":"scenario_unhandled","message":"Scenario API did not handle <METHOD> <path>"}}`.
     The scenario fails.
   - `literal`: record the entry and respond with `status` and `body`.
   - `world`: record the entry and compute the body from `world.server` as
     `semantics` describes. If the semantics find nothing, respond with
     `otherwise`.

A request that matches no operation is unmodeled in the same way. Literal
bodies are served verbatim. OAuth discovery returns production URLs
(`https://vercel.com/...`); the runner's origin routing sends the CLI's
follow-up requests to the fake API.

`teams.list` returns the user's `"direct"` memberships, in `teamOrder` order.
Order matters because the CLI picks the first match.

Whoami performs no mutations. Future mutating operations must update the
in-memory world, so that their effects appear in the actual world after.

### Faults

Faults use HTTP 400 on purpose. `Client.fetch` in the TS CLI retries 5xx
responses with backoff. On 429 it sleeps for Retry-After plus up to 30 s of
random skew. Faults test the CLI's `error.code` mapping, not transport retry.
Fault and error bodies never contain SAML codes or `teamId`: those start
reauthentication, which could open a real browser. The generator rejects them.

### Conformance vectors

Each file in `fake-api-vectors/` holds:

- `world` and `conditions`;
- a `request`: `method`, `path`, `query`, `headers.authorization?`, and
  `body?` (sent as `application/x-www-form-urlencoded`);
- the expected `status`, `json`, and the
  recorded `operation` entry (`null` when unmodeled).

A runner must pass every vector against its own fake API before it trusts its
scenario results. Vectors make the fakes of different runners agree with each
other, **not** with production. Keep direct unit tests and live integration
tests as complementary coverage.

## Catalogs

- **Errors** (`errors.json`): ids align with Go port reason names where those
  exist (for example `personal_scope_not_allowed`).
- **Capabilities** (`capabilities.json`):

  - `app-principal`: the CLI treats app tokens as principals, identified
    through introspection.
  - `production-origin-routing`: the runner invokes the CLI without `--api`
    and routes requests for `https://vercel.com` (OAuth) and
    `https://api.vercel.com` (API) to the fake API. The CLI refuses token
    introspection for custom API origins, so app-principal scenarios need
    this capability. The CLI itself needs no test-only configuration.

  The mechanism is runner-specific. The TS runner sets `APP_PRINCIPAL_ENABLED=1`,
  and its preloaded guard rewrites `fetch` requests for the production
  origins to the fake API. These mechanisms never appear in scenario files.

## Known cross-implementation differences

At Go commit `4206a4f` some scenarios pin TS behavior that Go does not match
yet. These are expected parity gaps:

- `whoami/scope-virtual-team`: Go has no `GET /teams/<slug>` fallback.
- `whoami/scope-teams-rate-limited`: Go reports "Not able to load teams".
- `whoami/logged-out`: the TS CLI makes one unauthenticated bootstrap
  `user.get`; the Go audit expects zero requests.
- `whoami/linked-project-local-override`: the TS CLI persists `userId` into
  `auth.json`.

## Go mapping sketch

- **Load.** Read `manifest.json`, then each scenario and vector file, with
  `encoding/json` and `Decoder.UseNumber()`. Optionally validate them against
  `schema/*.schema.json`.
- **Fake API.** Use `net/http/httptest` with a handler that implements
  "Fake API" over a copy of `world.server`. Validate it with the vectors in a
  `TestFakeAPIVectors` table test.
- **Sandbox.** Use `t.TempDir()` and write the `world.local` files with
  `os.WriteFile`.
- **Invoke.** Use `os/exec` with `cmd.Env` built from scratch (never
  `os.Environ()`) and `cmd.Stdin = nil`. Capture stdout and stderr in buffers.
- **Read back.** Walk `global-config/` and `workspace/` with `os.ReadDir` and
  `os.ReadFile`, strip `//` keys from `auth.json`, and skip the private
  telemetry files.
- **Compare.** Compare the canonicalized decoded values. The generator already
  applied the merge patch, so Go only compares.
- **Capabilities.** Call `t.Skipf("requires capability %s", id)` for
  capabilities the runner lacks.

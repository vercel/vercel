# API endpoint policy

New CLI commands and subcommands must not call Vercel REST API endpoints that
are outside the public OpenAPI spec (https://openapi.vercel.sh). This is a
**CI-only** check — there is no `endpoints` / `beta` markup on command
definitions and no runtime warning.

Enforced by `test/unit/util/api-endpoint-policy.test.ts`, which runs in CI —
a violation makes the PR unmergeable.

## What CI checks

For every non-grandfathered leaf command/subcommand, the test:

1. Finds implementation files under `src/commands/<name>/` and
   `src/util/<name>/` (subcommand entry files for nested commands). A few
   display-name → directory mismatches are remapped (e.g. `connect` →
   `connex`, `integration resource …` → `integration-resource/`, blob
   `delete-store` → `store-remove.ts`).
2. Statically extracts resolvable `client.fetch(...)` call sites (string
   literals and template literals; interpolations become `{}` path segments).
   Local `const base = '/v1/...'` bindings used as `${base}/token` fragments
   or `base + '/token'` concatenation are resolved to the full path.
3. Fails if any extracted call is missing from the live public OpenAPI spec.

Parent commands that only route to subcommands are skipped; each subcommand
is checked individually.

## How to fix a failure

Prefer moving the endpoint to the public OpenAPI spec (coordinate with the
API team that owns the route) before shipping the command. Discuss exceptions
with CLI maintainers rather than extending the grandfathered list casually.

## Limits of static extraction

Dynamic paths (non-local variables, complex expressions) and fetches in
shared helpers outside `commands/<name>` / `util/<name>` are out of scope
for this check. Local `base`/`url` bindings and simple `+` concatenation of
path fragments are supported. Keep fetches local when possible so the
policy can see them.

## How the public spec is loaded

The policy check fetches the live public OpenAPI spec from
https://openapi.vercel.sh at test time (`fetchPublicEndpoints()` in
`src/util/api-endpoint-policy/policy.ts`). There is no committed snapshot, so
an endpoint that has just been moved to the public spec is picked up on the
next test run, and a network failure fails the check loudly instead of
silently misclassifying endpoints.

## Grandfathered commands

Commands that existed before this policy are listed in
`src/util/api-endpoint-policy/grandfathered-commands.json` and are exempt
from the check (the policy only applies going forward).

- Do **not** add new entries to that file.
- When a command is deleted, remove its entry (a CI test flags stale
  entries).

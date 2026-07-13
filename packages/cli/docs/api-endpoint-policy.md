# API endpoint policy

Every new CLI command and subcommand must declare which Vercel REST API
endpoints it calls, and commands that depend on endpoints outside the public
OpenAPI spec must be explicitly marked as beta. This prevents shipping
stable-looking commands on top of unlaunched or internal APIs.

Enforced by `test/unit/util/api-endpoint-policy.test.ts`, which runs in CI —
a violation makes the PR unmergeable.

## Declaring endpoints

Add an `endpoints` field to the command (or subcommand) definition in its
`command.ts`:

```ts
export const installSubcommand = {
  name: 'install',
  // ...
  endpoints: [
    'GET /v1/integrations/integration/:slug',
    'POST /v1/integrations/installations',
  ],
} as const;
```

- Format is `"METHOD /path"`. Path parameters may use `:param` or `{param}`.
- Declare the endpoints called by that specific command/subcommand (helpers it
  invokes included). A parent command that only routes to subcommands
  typically declares `endpoints: []`.
- Use an empty array for commands that do not call the Vercel API at all.

## Private endpoints require `beta: true`

An endpoint is considered **private** when it is not part of the public
OpenAPI spec (https://openapi.vercel.sh). If any declared endpoint is
private, the command must be marked as beta:

```ts
export const installSubcommand = {
  name: 'install',
  beta: true,
  // ...
} as const;
```

Beta commands print a warning at the start of every invocation (see
`src/util/api-endpoint-policy/beta-warning.ts` — the single place this
warning lives) telling users the command is still in flux and may change.

Prefer moving the endpoint to the public spec over shipping beta commands
long-term. Coordinate with the API team that owns the endpoint.

## The public spec snapshot

The policy check compares declarations against a committed snapshot,
`src/util/api-endpoint-policy/public-endpoints.json`. If an endpoint was
recently made public and the check still flags it, refresh the snapshot in
the same PR:

```sh
node scripts/update-public-endpoints.mjs
```

## Grandfathered commands

Commands that existed before this policy are listed in
`src/util/api-endpoint-policy/grandfathered-commands.json` and are exempt
from the `endpoints` requirement (the policy only applies going forward).

- Do **not** add new entries to that file.
- When a grandfathered command adopts an `endpoints` declaration, remove its
  entry. The private-endpoints-require-beta rule applies as soon as a command
  declares endpoints.
- When a command is deleted, remove its entry (a CI test flags stale
  entries).

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
    { method: 'GET', path: '/v1/integrations/integration/:slug' },
    { method: 'POST', path: '/v1/integrations/installations' },
  ],
} as const;
```

- Each entry is a `CommandEndpoint` object (see `src/commands/help.ts`) with
  a `method` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `HEAD`) and a
  `path`. Path parameters may use `:param` or `{param}`.
- Declare the endpoints called by that specific command/subcommand (helpers it
  invokes included).
- The list must not be empty — an empty list would bypass the policy.
  Parent commands that only route to subcommands omit the `endpoints` field;
  each subcommand is checked individually.
- Leaf commands that call no Vercel API at all are intentionally not given an
  exemption. If you are adding one, raise it with the CLI maintainers so the
  policy can be extended deliberately rather than silently bypassed.

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

## How the public spec is checked

The policy check fetches the live public OpenAPI spec from
https://openapi.vercel.sh at test time (`fetchPublicEndpoints()` in
`src/util/api-endpoint-policy/policy.ts`) and compares declarations against
its operations. There is no committed snapshot, so an endpoint that has just
been moved to the public spec is picked up on the next test run, and a
network failure fails the check loudly instead of silently misclassifying
endpoints.

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

# Database CLI API Contract

This command intentionally does not read project environment variables or local
database credentials. The CLI calls Vercel-managed API endpoints that must
resolve the target database, enforce authorization, audit the operation, and
mint any provider-scoped access server-side.

The adjacent `../api` repository already routes storage resource operations
through `services/api-storage`. The closest existing endpoint is
`POST /storage/stores/integration/:id/repl`, implemented by
`services/api-storage/src/endpoints/integration-store-repl.ts`, which proxies a
marketplace provider `resource-repl` operation using `{ input, readOnly }`.
That path is suitable reference material for auth, rate limiting, store lookup,
provider dispatch, and audit events, but it is not enough for interactive shell
sessions without a new provider capability.

## Query

`POST /v1/databases/query`

Request body:

```json
{
  "projectId": "prj_123",
  "environment": "development",
  "resourceIdOrName": "store_or_resource_name",
  "role": "readonly",
  "sql": "select 1",
  "reason": "support ticket 123"
}
```

Response body:

```json
{
  "columns": ["id"],
  "rows": [{ "id": 1 }],
  "rowCount": 1,
  "durationMs": 12,
  "auditId": "aud_123"
}
```

Required backend behavior:

- Authenticate the Vercel user or token and derive the effective team scope.
- Confirm the project belongs to that scope.
- Resolve the connected database by `projectId`, `environment`, and optional
  `resourceIdOrName`; fail closed when ambiguous.
- Enforce role access server-side. Treat CLI readonly SQL checks as defense in
  depth, not authorization.
- Require an audit reason for production `readwrite` or `admin` operations.
- Execute through provider-scoped temporary access or a provider RPC. Do not
  return connection strings, passwords, service-role keys, or long-lived tokens.
- Emit an audit/event record containing user, team, project, resource,
  environment, role, reason, and provider operation id.

## Shell Sessions

`POST /v1/databases/sessions`

Request body:

```json
{
  "projectId": "prj_123",
  "environment": "development",
  "resourceIdOrName": "store_or_resource_name",
  "role": "readonly",
  "ttl": "10m",
  "reason": "support ticket 123"
}
```

Response body:

```json
{
  "sessionId": "dbsess_123",
  "expiresAt": "2026-05-08T12:15:00.000Z",
  "auditId": "aud_123",
  "command": {
    "executable": "psql",
    "args": ["postgres://temporary-session@example/db"],
    "env": { "PGPASSWORD": "temporary-secret" }
  }
}
```

Required backend behavior:

- Enforce the same auth, project/resource resolution, role checks, and audit
  requirements as query operations.
- Bound TTL server-side. The CLI currently permits 30 seconds through 1 hour.
- Mint credentials that are scoped to the requested role and expire when the
  session expires. Prefer provider-native temporary credentials or brokered
  sessions over reusable database users.
- Never expose Supabase service-role keys, Vercel project env vars, or default
  long-lived store token sets for this flow.
- Return only supported shell commands. The CLI will only launch bare
  `psql`, `mysql`, or `mariadb` executable names and will not inherit arbitrary
  local secret environment variables.
- Revoke or let expire server-side session credentials after `expiresAt` and
  make session ids auditable.

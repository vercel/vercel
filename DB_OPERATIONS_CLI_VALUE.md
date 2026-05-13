# Secure Database Operations in Vercel CLI

## Value

Adding database operations to the Vercel CLI gives teams a Vercel-native way to inspect and operate on connected databases without copying long-lived credentials out of project environment variables or provider dashboards.

The main value is not that users could never run SQL before. A sufficiently privileged user can often find `DATABASE_URL`, open a provider console, or use provider-specific CLIs directly. The value is that Vercel can make the secure path the easiest path:

- Use the already authenticated Vercel user and team context.
- Resolve the database connected to a Vercel project and environment.
- Default to read-only access.
- Require explicit reasons and confirmations for production write/admin access.
- Avoid exposing service-role keys, default store token sets, or long-lived database URLs to local shells.
- Produce consistent audit events tied to the Vercel user, team, project, environment, and resource.
- Give agents and automation a narrow, policy-enforced interface instead of broad credential access.

## Before CLI Support

Users can already perform many database operations, but the workflow is fragmented and often over-privileged.

### Inspecting Production Data

Before:

1. User opens the Vercel dashboard or provider dashboard.
2. User finds a database connection string, project env var, or provider token.
3. User copies it into a local terminal.
4. User runs `psql`, `mysql`, a provider CLI, or an ad hoc script.

Problems:

- The credential may be long-lived.
- The credential may be read/write even when the task only needs read-only access.
- The operation is not naturally tied to a Vercel audit reason.
- The local shell may leak credentials through history, process lists, logs, or agent context.
- Automation needs the same broad secret access a human would use.

### Running a Support Query

Before:

```bash
DATABASE_URL="postgres://..." psql "$DATABASE_URL" -c "select id, email from users where id = 'usr_123'"
```

Problems:

- The user had to acquire and handle the raw connection string.
- Vercel cannot easily enforce project/environment policy at query time.
- It is hard to distinguish a safe support lookup from a risky write operation.

### Opening a Database Shell

Before:

```bash
psql "postgres://long-lived-user:password@host/db"
```

Problems:

- The local process receives reusable credentials.
- The connection identity is the database credential, not clearly the Vercel user who requested access.
- Long-lived interactive sessions can outlive the original need.

## After CLI Support

The CLI becomes a thin client for Vercel-managed authorization, resource resolution, provider-scoped execution, and audit.

### Read-Only Query by Default

```bash
vercel db query "select id, email from users where id = 'usr_123'"
```

Behavior:

- Targets the linked project by default.
- Uses `development` by default unless `--environment` is provided.
- Uses `readonly` by default.
- Sends the request to Vercel API instead of reading `DATABASE_URL` locally.
- Backend resolves the connected database resource and dispatches to the provider contract.

### Production Read-Only Investigation

```bash
vercel db query \
  "select id, status, updated_at from orders where id = 'ord_123'" \
  --environment production \
  --resource neon-main
```

Value:

- No local production database credential handling.
- Vercel can check the user has access to the project and production env scope.
- Provider execution can use scoped temporary access or a brokered query operation.

### Production Write With Explicit Audit Reason

```bash
vercel db query \
  "update orders set status = 'refunded' where id = 'ord_123'" \
  --environment production \
  --role readwrite \
  --reason "support ticket 456" \
  --confirm-production-write
```

Value:

- Production writes require an explicit role escalation.
- Production writes require an audit reason.
- Non-interactive use requires an explicit confirmation flag.
- The backend enforces the same gates even if a caller bypasses CLI checks.

### Short-Lived Interactive Shell

```bash
vercel db shell \
  --environment production \
  --resource supabase-main \
  --role readonly \
  --ttl 10m \
  --reason "debugging customer report"
```

Value:

- The provider returns only a bounded shell session.
- The CLI only launches supported database clients.
- The CLI avoids inheriting arbitrary local secret environment variables.
- Session metadata can be audited and expired server-side.

## Why This Makes Sense in Vercel CLI

This fits the CLI because it is project-scoped operational work, similar in spirit to existing commands that inspect or mutate Vercel-managed resources. The CLI already has:

- Authenticated user and team context.
- Linked project resolution.
- Non-interactive mode support for automation and agents.
- Output formatting conventions.
- Existing patterns for guarded production operations.

The key difference from users doing it themselves is policy enforcement at the Vercel boundary. Without this command, users can often accomplish the task by extracting credentials. With this command, Vercel can provide the same capability while reducing credential exposure and making least privilege the default.

## Good Initial Use Cases

- Support engineers running read-only lookups against a connected project database.
- Developers validating migrations in development or preview environments.
- Incident responders performing tightly scoped production checks with audit reasons.
- Agents answering database questions without being given raw database URLs.
- Automation that needs a narrow database operation but should not receive broad env-var access.

## Non-Goals

- Replacing provider dashboards for full database administration.
- Exposing long-lived database connection strings through Vercel CLI.
- Returning Supabase service-role keys, default store token sets, or reusable provider API tokens.
- Implementing provider-specific database semantics in the CLI.

## Provider Responsibility

The Vercel CLI and API define the secure control plane. Providers still need to implement the actual `databaseQuery` and `databaseSession` operations for their resources.

Provider implementations should:

- Enforce the requested role.
- Bound and expire shell sessions.
- Avoid returning long-lived credentials.
- Return only schema-approved query/session responses.
- Record provider-side audit identifiers when available.


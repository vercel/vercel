# Storage

Storage lifecycle, project connections, and Blob file operations are separate. Creating a store does not necessarily connect it to a project; disconnecting does not delete the store; emptying Blob contents is different from removing the store itself.

Marketplace resources can appear in the unified storage listing while their creation/deletion belongs to the integration lifecycle. See [Integrations](integrations.md) rather than forcing a first-party store operation onto a provider resource.

Store names can collide across products. Resolve the store ID/type and team from returned candidates instead of assuming the first name match is correct.

## Connection Changes

Inspect the affected projects, environments, and environment-variable change set before applying a connection change. A new connection can default to every environment; an update can retain existing coverage. Do not infer those defaults from the current deployment.

Dry-run variable names can be computed exactly, read from an existing connection, or supplied only by the provider after mutation. Check `envVars.source` and compare the applied result with the preview; a provider-dependent preview is not a complete list of future variables.

Storage deletion and disconnection remove project connections or credentials and require interactive confirmation. Use inspection/dry-run evidence for the handoff rather than switching to another command family to bypass it. If local development uses a pulled env file, refresh it for the same project and team when a connection change affects development variables, including changes to the prefix, authentication mode, or credentials, and removal of development coverage. A change affecting only production variables does not require a development pull.

## Credential Changes

OIDC-backed Blob connections avoid a long-lived read-write token unless it is explicitly requested. Marketplace credentials are provider-managed. Changing connection environments or a prefix should not implicitly change authentication mode.

Moving a Blob connection to OIDC adds its OIDC variables and can remove the static token. Moving back to static credentials can leave OIDC variables present. Inspect the resulting variable set; leftover credentials can affect what the application selects.

## Blob Authentication

Blob operations require credentials for one store, not merely a Vercel account login. A read-write token identifies its store; OIDC requires both a token and store ID.

Credential precedence is explicit arguments, process environment, then `.env.local`. Within an environment source, partial OIDC configuration is an error rather than a fallback to the read-write token; a complete OIDC pair takes precedence over the static token. Check for stale or partial OIDC values when a seemingly valid static token is not used.

OIDC tokens expire. Do not persist a captured token as a durable credential; use a refresh-capable OIDC flow or an appropriate managed static credential for the runtime. Never put secret values in logs or command examples.

Non-interactive mode does not supply missing credentials or consent to destructive operations. Respect the operation's confirmation behavior; some file deletions act immediately, while store operations can require a separate confirmation.

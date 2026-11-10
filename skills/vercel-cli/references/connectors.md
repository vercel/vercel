# Connectors

Connector credentials belong to a subject and, for app credentials, an installation. Resolve the intended installation before requesting an app token; do not assume a default installation is the one that owns the user's data.

Omitting scopes requests the connector's defaults, not an empty permission set. Use the requested operation to choose the needed permissions. Tokens and trigger URLs can grant third-party access; avoid exposing them in output.

Attaching credentials to a project and registering it as a webhook destination are distinct. Verify the intended project, environment, branch, and handler path before enabling delivery. Connector removal can affect every attached project; inspect connections first.

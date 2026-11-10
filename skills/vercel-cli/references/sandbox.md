# Sandbox

The Vercel CLI delegates sandbox operations to the Sandbox CLI. Use its installed help for the forwarded process arguments and supported lifecycle operations.

Sandbox credentials are scoped through the selected Vercel context. Automation's `VERCEL_TOKEN` is forwarded as `VERCEL_AUTH_TOKEN`; sandbox login is distinct from a shell inside a running sandbox.

Creating a sandbox provisions external compute; confirm intent before creating or connecting to one. Snapshotting stops the sandbox before capturing its filesystem; account for any running work before taking a snapshot. A snapshot is a stored artifact, not a still-running process.

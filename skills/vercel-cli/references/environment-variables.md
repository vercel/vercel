# Environment Variables

Variables are scoped to environments and can have preview-branch overrides. Inspect the intended target and metadata without exposing values unnecessarily; JSON output can contain plain values even when sensitive variables are redacted.

## Values and Local Files

Environment pull writes an application env file; project pull writes settings and environment data under `.vercel/`. They serve different consumers. The default `.env.local` pull updates ignore rules, but a custom filename must already be excluded from source control.

Pulling cannot recover stored Secret values. A redacted Secret preserves an existing local value or produces `[SENSITIVE]`; that placeholder is not a credential. Obtain a usable value through the appropriate secret owner rather than passing the placeholder to an application.

See the [Environment Variables documentation](https://vercel.com/docs/projects/environment-variables) for dashboard setup.

## Local Development

Use the project's existing development workflow when it is sufficient. For development that uses a linked Vercel project, choose the settings and environment pull format consumed by the process. The CLI's local-only development mode can run without linking; do not require remote setup for that workflow.

When using a linked project, verify the resolved project from the actual working directory before pulling data or starting the server. Repository mappings can select a different project than the app directory suggests; see [project targeting](../SKILL.md#project-targeting). Inspection and pull can trigger browser login or team SAML re-authentication; wait for completion rather than trying unrelated credentials or targets.

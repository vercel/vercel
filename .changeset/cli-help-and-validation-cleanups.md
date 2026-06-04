---
'vercel': patch
---

CLI help and command-schema cleanups from the docs audit:

- `blob`: remove orphan `addStoreSubcommand`, `removeStoreSubcommand`, and `getStoreSubcommand` exports that duplicated the wired `create-store` / `delete-store` / `get-store` specs. Handlers and telemetry now import the actual wired subcommand definitions.
- `dns list`: the `<domain>` argument is now declared `required: false` to match the runtime, which already supports listing every domain's records when no argument is given.
- `routes delete`: declare the `<name-or-id>` argument as `multiple: true` so the help synopsis and schema match the variadic behavior already supported by the handler and shown in the existing examples.
- `init`: fix the "Initialize example project into specified directory" help example, which was missing the `init` literal (`vercel <example> <dir>` → `vercel init <example> <dir>`).
- `promote status` and `rollback status`: declare `--timeout` on the `status` subcommand options so `--help` matches the examples (`promote status --timeout 30s`, `rollback status --timeout 30s`). The flag is also kept on the parent command, where parsing actually happens.

---
'vercel': minor
---

Add `vercel flags` command to manage feature flags from the CLI. This includes subcommands for listing, inspecting, creating, deleting, archiving, enabling, and disabling feature flags, as well as managing SDK keys for flag evaluation.

New commands:
- `vercel flags ls` - List all feature flags
- `vercel flags inspect <flag>` - Display detailed information about a feature flag, including its variants
- `vercel flags add <slug>` - Create a new feature flag
- `vercel flags rm <flag>` - Delete a feature flag (must be archived first)
- `vercel flags archive <flag>` - Archive a feature flag
- `vercel flags disable <flag>` - Disable a flag in an environment
- `vercel flags enable <flag>` - Enable a flag in an environment
- `vercel flags sdk-keys ls` - List SDK keys
- `vercel flags sdk-keys add` - Create a new SDK key
- `vercel flags sdk-keys rm <key>` - Delete an SDK key

The `flags disable` command includes smart variant selection:
- Use `--variant <id>` to specify which value to serve (validates the variant exists)
- Boolean flags automatically select the `false` variant
- String/number flags with multiple variants prompt the user to choose

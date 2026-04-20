---
'vercel': minor
---

`vercel env add` now defaults Environment Variables to **sensitive** on Production and Preview. Sensitive values are encrypted at rest and cannot be retrieved later via the dashboard or CLI; they are still resolved for builds, deployments, `vercel env pull`, and runtime.

Behavior per target:

- **Production** or **Preview**: defaults to `sensitive`. Pass `--no-sensitive` to opt back in to the previous `encrypted` behavior (value remains readable later).
- **Development**: always stored as `encrypted` (sensitive is not supported by the Vercel API for Development). Passing `--sensitive` alongside a Development target now errors up-front instead of silently falling back.
- **Mixed selection** (e.g., interactive checkbox picks `production + preview + development`): errors and asks you to run `vercel env add` separately for Development, because Development cannot share a record type with Production/Preview.

Flag summary:

- `--sensitive`: unchanged in meaning (request a sensitive variable); now errors when combined with Development.
- `--no-sensitive`: new; opt out of the new default for Production/Preview.
- `--sensitive --no-sensitive` together: errors.

On teams that enable the "Enforce Sensitive Environment Variables" policy in team settings, the CLI now reads the policy from the team object and notes in the output that the policy is active; the server already promotes Production/Preview variables to sensitive silently, and the CLI's own logs are now honest about it.

The interactive prompt (`Make it sensitive?`) still fires when you don't pass `--sensitive` or `--no-sensitive`, the targets include Production or Preview, and the team policy is not enforcing. It defaults to yes.

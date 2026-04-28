# CLI Eval Coverage Review

## Current Assessment

The marketplace evals are the strongest command-specific group because they combine command telemetry with live Vercel API checks and cleanup. The env mutation evals are also useful, especially `env/remove`, which verifies project state after the operation.

Several non-marketplace evals were too shallow before this pass:

- `_smoke` is intentionally minimal and should not be treated as command-quality coverage.
- `_deploy` is brittle because it depends on a hardcoded scope and checks for framework text in stderr.

This pass improved `init`, `non-interactive`, `login-whoami`, `login-not-logged-in`, `curl/explicit`, `curl/implicit`, and `env/ls` so they now verify command choice plus saved artifacts/results instead of relying only on telemetry. It also added read-oriented coverage for missing core CLI command families.

## Added Coverage

- `project/inspect` - inspect the linked project and save project output.
- `project/list` - list projects in the current scope and save output containing the linked project when present.
- `list` - list deployments for the linked project and save command output.
- `inspect` - create a preview deployment, inspect it, and save the target plus inspection output.
- `logs` - create a preview deployment, run bounded logs retrieval, and save output.
- `pull` - run `vercel pull` non-interactively and verify `.vercel/.env.development.local` plus project settings.

## Remaining High-Value Gaps

- `login-not-logged-in` now simulates missing credentials and verifies the normal authenticated state, but it still avoids a true browser-based login flow because that is not practical in CI.
- `alias list` can be covered safely as read-only; `alias set/remove` should use an ephemeral deployment and generated alias if added later.
- `rollback status`, `promote`, `redeploy`, and `remove` are important but need careful fixtures to avoid mutating shared state.
- `domains`, `dns`, `certs`, and firewall commands should stay out of the default suite unless they use isolated test resources.
- `dev` coverage would need a different harness pattern because it starts a long-running local server.

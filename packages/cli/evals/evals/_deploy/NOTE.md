## Known Issue

`_deploy` is currently flaky / failing for two separate reasons:

1. The prompt and verifier are hardcoded to the `agentic-zero-conf` scope, but
   current local runs may not have access to that scope. In that case the deploy
   command fails with `The specified scope does not exist`.
2. The verifier in [EVAL.ts](./EVAL.ts) is brittle. It checks for:
   - `fixture/.vercel/project.json`
   - `vercel project inspect --scope agentic-zero-conf`
   - `Hono` appearing in `stderr`

This means `_deploy` can fail even when the deploy path itself is mostly
working, and it can also fail for account/scope drift rather than actual agent
behavior.

When revisiting this eval:

- Confirm the intended scope and token context first.
- Decide whether `_deploy` should use a fixed scope at all.
- Replace the current verifier with a deployment outcome check that is less
  coupled to `stderr` output.

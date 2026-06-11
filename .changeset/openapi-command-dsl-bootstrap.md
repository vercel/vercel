---
'vercel': patch
---

Add an experimental `inferCommands()` DSL that derives CLI subcommands from the Vercel OpenAPI spec. Behavior is gated entirely behind the hidden `--infer` flag (e.g. `vercel --infer projects ls`); without it, every existing command runs through its original handler unchanged. No telemetry, output, or dispatch is altered for users who don't opt in.

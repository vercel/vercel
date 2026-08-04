---
'vercel': minor
---

Teach `vercel connect create` the connection methods a service publishes.

When a service describes how it can be connected to, the command asks which product to connect to and how, shows the provider's setup steps, prompts for the credentials that method needs, and lets the server resolve the endpoints and connector type.

Adds `--connection-method`, `--target`, `--param KEY=VALUE`, and `--yes` for scripted use, and adds `service`, `connectionMethod`, and `target` to `--json` output. The positional argument is now documented as `<service>`; it was called `type`, which read as a synonym for the unrelated `--connector-type` flag.

Services that publish no connection methods, and `--data` on its own, keep their existing behavior.

---
'vercel': patch
---

Preserve an environment's serving mode when feature flag rules are added,
updated, moved, or removed. When the environment is serving a fixed variant,
the CLI identifies that variant and warns that rule changes will not affect flag
evaluation until the environment uses targeting again.

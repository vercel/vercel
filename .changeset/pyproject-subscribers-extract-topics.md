---
'@vercel/python': patch
---

Derive queue subscriber topics from code when `topics` is omitted in a `[[tool.vercel.subscribers]]` entry. The builder imports the subscriber entrypoint and calls `get_queue_subscriptions()` on it to collect topics and per-topic trigger config. Explicit `topics` are validated against the code-declared subscriptions: each topic must be declared by the code (exactly or via a wildcard pattern) and adopts the matching subscription's trigger config. Entrypoints that do not implement `get_queue_subscriptions()` keep the previous behavior of trusting explicit `topics` as-is. In `vercel dev`, subscribers without explicit topics subscribe to every topic (`*`) and the worker's own routing dispatches messages; detection and topic validation run at build time.

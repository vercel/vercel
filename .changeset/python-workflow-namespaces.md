---
'@vercel/python': patch
---
Allow multiple `[[tool.vercel.workflows]]` entrypoints with namespaced registries
Queue-served workflow Lambdas already attach the topics their registry
registers, so namespaced registries (`Workflows(namespace="billing")`) get
their `__billing_wkf_*` triggers from introspection with no extra detection
step. The builder now recognizes namespaced topics when partitioning
subscriptions between subscriber and workflow Lambdas, rejects entrypoints
whose topics overlap, and keeps the single-entrypoint requirement only for
the legacy vercel-workers serving mode where every consumer shares `__wkf_*`.

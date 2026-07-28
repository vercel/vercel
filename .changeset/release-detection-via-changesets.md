---
---

Fix binary release gating in the Release workflow: instead of inferring a
release from whether the committed `vercel` version is on npm, the `determine`
job now reads the pending changeset state with the same `@changesets/read` and
`@changesets/pre` logic `changesets/action` uses. The binary build only runs
when the push will actually publish `vercel`.

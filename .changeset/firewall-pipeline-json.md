---
'vercel': minor
---

`vercel firewall status --json` now reports the request pipeline as data: `requestFlow`, the stages a request passes through in order, matching the dashboard's firewall diagram — including its grouping, its per-stage descriptions, and the routing stages a request reaches when nothing blocks it — and `bypasses`, giving the system and custom bypass kinds with the stages each one skips.

Each stage separates static topology (`order`, `group`, `label`, `description`, `configurable`, `skippableBy`) from this project's configuration (`state`, `count`, `action`, `rulesets`, `skippedBy`), so `skippedBy` reports what a project's bypasses actually skip rather than what could skip the stage. A system bypass the plan cannot read is reported as `state: "unknown"` with no count, instead of being indistinguishable from no bypasses at all.

`overview --json` gains `activityUnavailable`, which names a plan-gated activity window that previously appeared only as null fields. Its traffic rows move from `rules` to `topRules`, so the key does not collide with the rule counts `status --json` reports under `rules`, and each entry in `series` drops the `total` that `stats` already reports for the same action.

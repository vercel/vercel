---
'vercel': patch
---

Add hidden `vc experiment` command: metrics (create/list), create draft JSON experiment flags, list/start/stop experiments, and analyse results via `/web/insights/experiment-results`. Aligns with feature-flags experiment config and `hasExperiment` list filter.

Stabilize experiment routing unit tests with `vi.hoisted` + `vi.mock` instead of spying on ESM default exports.

Unit tests use the linked project id from the flags fixture (`vercel-flags-test`); register `experiment` in the commands map snapshot test. Use `vitest run` in the `vitest-run` script for CI.

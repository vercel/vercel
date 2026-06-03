---
---

Release workflow now publishes a `canary` snapshot of the release commit and runs the unit + e2e suites against that snapshot (with `VERCEL_CLI_VERSION` pointed at the published spec) before promoting to the real versioned release. This catches changesets that omit a workspace dependency bump before the broken versions reach the `latest` tag.

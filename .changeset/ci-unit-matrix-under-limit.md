---
---

CI: keep the full (run-all) unit-test matrix under GitHub Actions'
256-configuration limit. The matrix had grown past the limit, so the
`unit-test` job failed to start and no unit tests ran. Two changes: skip Node 20
on the Windows runner for the `vitest-unit` lane (lowest-value cell — slowest
runner, oldest Node; Node 20 still runs on Linux/macOS and Node 22 runs on all
three), and run the new `@vercel/container` unit tests on Linux only (pure logic
with spawn/fs/fetch mocked, so OS-independent).

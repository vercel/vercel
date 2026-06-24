---
---

CI: run `@vercel/container` unit tests on Linux only. Its tests are pure logic
(spawn/fs/fetch mocked), so the macOS/Windows copies add no coverage and pushed
the all-packages unit-test matrix past GitHub Actions' 256-configuration limit.

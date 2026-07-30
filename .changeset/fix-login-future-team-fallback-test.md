---
---

Fixed the `login/future.test.ts` team-fallback unit test: after `vi.resetModules()` the freshly imported login command used a new output-manager singleton bound to the real stderr, so `toOutput` assertions timed out. The fresh singleton is now re-initialized onto the mock client stream.

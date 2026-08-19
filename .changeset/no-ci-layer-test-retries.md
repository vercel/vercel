---
---

Removed the GitHub Actions-level test retry loops from the unit and E2E test jobs so a failing test suite fails on its first attempt. Retries do not belong in the CI layer; any retrying should live in source code.

---
---

Fixed `test-unit` scripts in `@vercel/fs-detectors` and `@vercel/gatsby-plugin-vercel-builder` failing on Windows with "No test files found". The `test/unit.*test.*` argument relied on shell glob expansion, which cmd.exe does not perform, so vitest received the literal string as a filter and matched nothing. Switched to vitest's substring filter (`test/unit.`), matching the existing `vitest-unit` scripts.

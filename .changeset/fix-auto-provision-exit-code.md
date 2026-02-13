---
"vercel": patch
---

Fix `integration add` auto-provision to exit 1 when browser fallback is triggered instead of falsely reporting success. Add `.catch()` to all `open()` calls to prevent unhandled promise rejections in headless/CI environments.

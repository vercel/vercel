---
'vercel': patch
---

Fix login device-flow unit tests under CI: clear `CI` when asserting browser open, and read already-flushed stderr via `getFullOutput`.

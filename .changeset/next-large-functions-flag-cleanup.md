---
'@vercel/next': patch
---

Clean up the `NEXT_EXPERIMENTAL_LARGE_FUNCTIONS` flag: routes that individually exceed the default packing budget are now always emitted as their own function, no opt-in required.

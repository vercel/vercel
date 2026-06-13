---
'@vercel/functions': patch
---

Fix BuildCache timeout handling to prevent hanging during response parsing

Moves `clearTimeout()` calls to occur immediately after fetch completion rather than after `response.json()` parsing. This prevents indefinite hangs when JSON parsing is slow or fails, which was causing 60-second build timeouts in static generation.

The timeout now properly covers the network request phase, while allowing JSON parsing to complete without being constrained by the abort signal (which doesn't affect JSON parsing anyway).

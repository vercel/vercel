---
'@vercel/python-workers': patch
---

[vercel-workers] Treat a 404 from the automatic post-success acknowledgement as a successful settlement, so an at-least-once redelivery of an already-acked message no longer fails the callback.

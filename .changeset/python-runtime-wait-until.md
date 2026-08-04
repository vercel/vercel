---
'@vercel/python-runtime': minor
---

Add invocation-scoped `wait_until` to the Python runtime. Awaitables attached
during a request are drained after the response is sent, bounded by the
Function's maximum duration, and exposed to the SDK's
`vercel.functions.wait_until()` through the invocation context.

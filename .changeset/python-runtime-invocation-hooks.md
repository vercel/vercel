---
'@vercel/python-runtime': minor
---

Add private invocation hooks: Vercel-owned integrations can call
`run_on_next_invocation()` to run work once on an upcoming request, off the
response path and with that request's context. Failures retry with backoff on
later requests, and `repeat_after_seconds` re-arms a hook after each success.

---
'@vercel/python-runtime': minor
---

Let invocation hook callbacks choose their next run time by returning a
non-negative number of seconds. Returning a number keeps even a one-shot
hook alive; returning None keeps the registered cadence.

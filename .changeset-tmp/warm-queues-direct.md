---
"@vercel/python-workers": patch
---

Add explicit Python queue worker retry and acknowledgement directives. Workers can now return or raise `RetryAfter` and `Ack` to control retry and acknowledgement behavior.

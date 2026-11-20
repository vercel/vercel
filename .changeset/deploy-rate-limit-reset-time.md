---
'vercel': patch
---

Show the rate limit reset time the API actually reported when a deploy is rate limited. The seconds-based `reset` field was compared against a millisecond clock, so the message read `Please retry in -19703 days`; it now prints the reset timestamp, plus a relative hint when the window is still open.

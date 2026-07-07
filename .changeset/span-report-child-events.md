---
'@vercel/build-utils': patch
---

Add `Span.reportChildEvents()` so a tree of trace events produced in another process (e.g. a forked build worker) can be reported under an existing span. Its root events are reparented to that span while links internal to the set are preserved, keeping trace nesting intact.

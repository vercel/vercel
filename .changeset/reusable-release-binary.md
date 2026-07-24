---
---

Make the Release Binary workflow reusable via `workflow_call` and call it directly from the Release workflow as a dependent job, replacing the fire-and-forget `workflow_dispatch` API trigger. Native binaries now build and publish within the same run graph as the release. Behavior is equivalent to today (natives publish after `vercel`, assets upload to the GitHub Release); the existing tag-push and manual dispatch paths are unchanged.

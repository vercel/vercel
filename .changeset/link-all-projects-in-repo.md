---
'vercel': patch
---

Offer to link every project connected to the repository in one pass from `vc link`, and stop asking which Git remote to use while gathering those suggestions: the default remote (`origin` when present) is used and named in the option's footer. When the repository has more than one remote, a "Choose a different remote" option re-runs the search against another remote

---
'@vercel/container': patch
---

Fix container service build output so requests reach the function. Container services now do a normal build, emitting the function at the natural `index` path inside the nested `services/<name>/` output along with a catch-all route, instead of namespacing under `_svc/<name>/index` with no route to it. Previously a request to the service root never matched the function.

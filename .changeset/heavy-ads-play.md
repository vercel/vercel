---
'@vercel/python': minor
---

Add runtime dependency install to support larger Python functions

This adds logic to calculate the total size of a lambda at build time and offload dependencies
to a _runtime_requirements.txt file so they can be installed at runtime by uv. This allows us to
deploy functions up to the total size of the /tmp folder.

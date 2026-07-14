---
'@vercel/python-workers': patch
---

Authenticate v2beta queue callbacks before executing workers. The callback now always re-fetches the authoritative message by id from the queue service and ignores the inline request body, and routes the re-fetch and ack/visibility calls to the shard named by the `ce-vqsregion` header.

---
'@vercel/python-runtime': patch
---

Decode `Transfer-Encoding: chunked` WSGI request bodies that arrive without a `Content-Length`, and strip the hop-by-hop framing header from the WSGI environ (PEP 3333).

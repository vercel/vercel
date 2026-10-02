---
'@vercel/next': patch
---

Reject Next.js parameter matching builds when the Vercel adapter did not produce build output, instead of deploying incomplete routing behavior through the legacy builder.

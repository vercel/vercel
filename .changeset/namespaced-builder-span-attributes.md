---
'vercel': patch
---

Use namespaced vc.builder span attributes (builder.name, builder.version, builder.dynamicallyInstalled) so they appear correctly in Datadog and don't conflict with reserved `version` tag

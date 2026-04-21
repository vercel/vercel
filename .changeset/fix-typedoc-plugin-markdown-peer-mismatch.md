---
'@vercel/oidc': patch
'@vercel/oidc-aws-credentials-provider': patch
'@vercel/functions': patch
'@vercel/firewall': patch
---

Pin `typedoc-plugin-markdown` to `3.15.2` and `typedoc-plugin-mdn-links` to `3.0.3` to match the version used by `@vercel/edge`. The previous `4.1.2` version requires `typedoc@0.26.x` as a peer dependency but was paired with `typedoc@0.24.6`, which caused CI failures whenever pnpm hoisted the 4.x plugin (the plugin calls `app.internationalization.addTranslations`, which does not exist in typedoc 0.24). The choice of which plugin version got hoisted was non-deterministic, which is why the failure appeared as flaky `Build @vercel/<pkg>` steps in CI.

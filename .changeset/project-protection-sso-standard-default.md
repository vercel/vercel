---
'vercel': major
---

`vercel project protection enable --sso` without `--deployment-type` now turns on Vercel Authentication with Standard Protection (`all_except_custom_domains`) instead of the legacy Standard Protection (`prod_deployment_urls_and_all_previews`). To keep the old behavior, pass `--deployment-type legacy-standard`. `--password` keeps its existing default. The CLI warns when the new default replaces a different existing setting.

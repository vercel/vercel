---
'vercel': patch
---

`vercel onboard` now installs prebuilt branch tarballs of the harness
packages from the team deployment (`VERCEL_ONBOARD_HARNESS_REMOTE`,
defaulting to the fork's deployment) before falling back to the npm
registry. The registry build requires a sandbox provider and cannot drive
an already installed agent executable, which crashed sessions for anyone
without a local vercel/ai checkout.

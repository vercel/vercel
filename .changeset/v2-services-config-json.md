---
'vercel': patch
---

`vc build` now writes `experimentalServicesV2` services into the Build Output API `config.json` `services` array (previously only `experimentalServices` were included), so V2 services are recorded on the deployment.

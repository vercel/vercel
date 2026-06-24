---
'vercel': patch
---

Fix `vc dev` erroring with "Project framework is set to 'services', but no
services are declared" for `experimentalServicesV2` (`services`) projects. When
the dev server already has resolved services, it now skips zero-config builder
detection and lets the services orchestrator build and run them. Previously
`detectBuilders` ran with the remote `framework: "services"` setting but no
service config threaded in, which failed even though detection had succeeded.

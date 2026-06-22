---
'@vercel/container': patch
---

Fix a temp env-file leak in `vc dev` for container services. When a container
exited before publishing its port, `startDevServer` threw out of the readiness
loop without removing the temporary Docker `--env-file` directory, which holds
the full merged environment (including secrets). All failure paths now funnel
through the container shutdown helper, which stops the container and removes the
env-file exactly once.

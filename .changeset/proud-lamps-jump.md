---
---

Release Binary now downloads the prebuilt pruned Node runtimes from the
rolling `node-runtime-v<version>` GitHub Release (published by
build-node-runtime.yml) instead of compiling Node from source on every
release. Removes the in-workflow manylinux/turbo Node build steps and the
now-unused `turbo.node-runtime.json`.

---
---

Removed the `isPythonEntrypoint` export from build-utils with no public replacement. Python entrypoint filtering now lives privately in fs-detectors, while the CLI keeps Python analysis external so its WASM assets remain available.

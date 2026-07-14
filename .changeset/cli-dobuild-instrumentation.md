---
'vercel': patch
---

Add finer-grained `vc.doBuild` spans (`vc.readConfigInputs`, `vc.prepareFlagsDefinitions`, `vc.getFiles`, `vc.populateFilesMap`, and `vc.setMonorepoDefaultSettings`) so build-container traces can attribute previously unaccounted CLI orchestration time.

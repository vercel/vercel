---
'vercel': patch
---

`vc logs` accepts the deprecated `--format`, `--output`, `--search`, and `--no-branch` flags again instead of failing with an unknown option error. `--format json` maps to `--json` and `--search` maps to `--query`; the other flags are ignored. Each deprecated flag prints a notice on stderr that names its replacement.

---
'vercel': patch
---

fix(cli): improve agent discoverability of integration-resource commands

- Add `integration-resource` cross-references in `integration --help` and `integration remove --help`
- Emit structured JSON with resource names and next commands when `integration remove --format=json --yes` fails because resources still exist

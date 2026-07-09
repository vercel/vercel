---
'vercel': minor
---

`vercel link` now honors `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as an
explicit project-owner pair: when both are set, the command resolves and
confirms exactly that pair without prompting and without `--yes`, and leaves
local link files untouched. An unresolvable pair errors instead of falling
back to prompts. The new-project `Name?` prompt also suggests a creatable
default: when the folder name is already a project in the selected team, it
suggests `<folder-name>-<short suffix>` instead of a name that can only fail
"Project already exists" validation.

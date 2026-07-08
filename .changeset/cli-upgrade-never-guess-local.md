---
'vercel': patch
---

`vercel upgrade` no longer classifies the installation as local without positive evidence (a lockfile found above the CLI's install location). Previously, when the installation layout was not recognized, the upgrade defaulted to running `npm i vercel@latest` in the current working directory — silently adding `vercel` to whatever project (or home directory) the user happened to be standing in. Unrecognized layouts now degrade to a global npm upgrade, which runs from a temporary directory and cannot modify the current project.

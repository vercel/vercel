---
'vercel': patch
---

Turn the root directory prompt into a browsable picker. `Code directory?` now lists the directories it finds instead of asking you to type a path: tab enters a folder, typing filters by name at any depth (`cli` finds `packages/cli`), and each row shows its detected framework. Repo-wide detection starts as soon as a new Project is selected, so labels are ready by the time the picker renders. The current directory is shown as `./` and, as before, stores no Root Directory setting.

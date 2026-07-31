---
'vercel': patch
---

Ask to connect a detected Git repository before creating the project, so the question no longer appears after the project has already been created. Under `--yes` or non-interactive mode the `origin` remote is used without prompting instead of showing a remote picker.

Also detect the Git repository from subdirectories. Linking from `apps/web` previously found no `.git` and silently skipped the question, so the repository was never offered for connection. When a repository is connected from a subdirectory, the Project's Root Directory is now set to that subdirectory — connecting without it pointed every Git-triggered build at the repository root instead of the linked directory. The resulting Root Directory is reported in the summary after the project is created.

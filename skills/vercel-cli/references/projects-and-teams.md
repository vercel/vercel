# Projects & Teams

Use supplied account context or scoped discovery to identify the intended team/project. An authentication check does not establish the project target. Prefer explicit one-command targeting when available rather than changing a local link for an unrelated lookup.

A single page or one checked scope does not prove that no projects or deployments exist. Follow pagination and investigate relevant candidate scopes; avoid enumerating unrelated teams. If several plausible targets remain, ask the user to choose from the candidates found.

Project deletion is permanent and requires the CLI's confirmation. Renaming a Vercel project does not rename its linked GitHub repository. Verify the resulting project identity and Git connection when either changes.

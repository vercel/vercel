# Getting Started

## Install

```bash
npm i -g vercel
```

## First-Time Setup

1. **Authenticate** - `vercel login` opens a browser/device flow. For CI, use the `VERCEL_TOKEN` environment variable instead. Wait for deliberate user completion when a browser flow starts.
2. **Link your project** - `vercel link` for a working-directory project or `vercel link --repo` for repository directory mappings. Both create files under `.vercel/`.
3. **Verify the target** - from the intended working directory, run `vercel project inspect` and confirm its owner and project. `vercel whoami` identifies the authenticated user and effective team, not the linked project.
4. **Pull local data** - `vercel pull` writes project settings and environment data under `.vercel/`, including `.vercel/.env.<environment>.local`. Use `vercel env pull` to write `.env.local` or a named file instead.
5. **Dev or deploy** - `vercel dev` starts a local server; `vercel --prod` deploys to production.

## Project Linking

Project resolution starts from the command's working directory:

- **`<cwd>/.vercel/project.json`**: This exact working-directory link takes precedence. A root single-project link is not generally inherited by arbitrary subdirectories.
- **`<repo-root>/.vercel/repo.json`**: The deepest configured directory containing the working directory wins.
- **No matching repo directory**: Interactive mode prompts. Non-interactive mode currently selects the sole configured repo project, or fails when multiple projects remain.

An app subdirectory only identifies a project when the repo mapping covers it. Verify the result with `vercel project inspect` before operating on the project.

Read-only inspection can trigger login or team SAML re-authentication, open a browser/device flow, and wait for approval. Ask the user to complete the flow before retrying or continuing.

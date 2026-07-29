# Local Development

## Prerequisites

1. **Link your project** - use `vercel link` for the current directory or `vercel link --repo` for repository directory mappings.
2. **Verify the target** - run `vercel project inspect` from the directory where you will run development commands and confirm the reported owner and project. `vercel whoami` does not verify the project.
3. **Pull local data** - use `vercel pull` for project settings and environment data under `.vercel/`, or `vercel env pull` for `.env.local` or a named file.

Inspection and pull commands can trigger login or team SAML re-authentication. If a browser/device flow opens, wait for the user to complete it deliberately.

## Usage

```bash
vercel dev                           # default: 0.0.0.0:3000
vercel dev --listen 8080             # custom port
vercel dev --listen 127.0.0.1:5000   # custom host and port
```

## Related Commands

- `vercel link` - connect the current directory to a Vercel project. Use `--repo` for repository directory mappings.
- `vercel project inspect` - report the resolved project's owner and settings.
- `vercel pull` - download project settings and environment data to `.vercel/`, including `.vercel/.env.<environment>.local`.
- `vercel env pull` - download environment variables to `.env.local` or a named file, not project settings.
- `vercel init` - scaffold a new project from a Vercel example.
- `vercel open` - open the Vercel dashboard for the linked project.

With `repo.json`, the deepest configured directory containing the working directory wins. If no mapping matches, interactive mode prompts; non-interactive mode currently selects the sole configured project or fails when multiple projects remain. Do not infer the target from the app directory alone.

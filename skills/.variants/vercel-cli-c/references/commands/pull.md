<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel pull

Pull latest environment variables and project settings from Vercel. 

```
vercel pull [project-path] [options]
```

## Options

- `--environment <TARGET>` — Deployment environment [development]
- `--git-branch <NAME>` — Specify the Git branch to pull specific Environment Variables for
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Skip questions when setting up new project using default scope and settings

## Examples

Pull the latest Environment Variables and Project Settings from the cloud

```
$ vercel pull
```

Pull the latest Environment Variables and Project Settings from the cloud targeting a directory

```
$ vercel pull ./path-to-project
```

Pull for a specific environment

```
$ vercel pull --environment=<production | preview | development>
```

Pull for a preview feature branch

```
$ vercel pull --environment=preview --git-branch=feature-branch
```

If you want to download environment variables to a specific file, use `vercel env pull` instead

```
$ vercel env pull
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel build

Build the project.

```
vercel build [options]
```

## Options

- `--id <ID>` — Deployment ID to pull environment variables from (e.g. dpl_xxx)
- `--output <DIR>` — Directory where built assets will be written to
- `--prod` — Build a production deployment
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--standalone` — Create a standalone build with all dependencies inlined into function output folders
- `--target <TARGET>` — Specify the target environment
- `-y, --yes` — Skip the confirmation prompt about pulling environment variables and project settings when not found locally

## Examples

Build the project

```
$ vercel build
```

Build the project in a specific directory

```
$ vercel build --cwd ./path-to-project
```

Build with deployment-scoped environment variables

```
$ vercel build --id dpl_xxx
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel promote

Promote an existing Deployment to current

```
vercel promote <url|deploymentId> [options]
```

## Options

- `--timeout <TIME>` — Time to wait for promotion completion [3m]
- `-y, --yes` — Skip the confirmation prompt when linking a Project

## Subcommands

### `vercel promote status`

Show the status of any current pending promotions

```
vercel promote status [project] [options]
```

#### Options

- `--timeout <TIME>` — Time to wait for promotion completion [3m]
- `-y, --yes` — Skip the confirmation prompt when linking a Project

#### Examples

Show the status of any current pending promotions

```
$ vercel promote status
$ vercel promote status <project>
$ vercel promote status --timeout 30s
```

## Examples

Promote a Deployment using ID or URL

```
$ vercel promote <deployment id|url>
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

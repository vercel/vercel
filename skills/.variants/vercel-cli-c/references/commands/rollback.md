<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel rollback

Quickly revert back to a previous deployment

```
vercel rollback <url|deploymentId> [options]
```

## Options

- `--timeout <TIME>` — Time to wait for rollback completion [3m]
- `-y, --yes` — Accept default value for all prompts

## Subcommands

### `vercel rollback status`

Show the status of any current pending rollbacks

```
vercel rollback status [project] [options]
```

#### Options

- `--timeout <TIME>` — Time to wait for rollback completion [3m]

#### Examples

Show the status of any current pending rollbacks

```
$ vercel rollback status
$ vercel rollback status <project>
$ vercel rollback status --timeout 30s
```

## Examples

Rollback a deployment using id or url

```
$ vercel rollback <deployment id/url>
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

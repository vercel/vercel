<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel list

List deployments.

Aliases: `ls`

```
vercel list [app] [options]
```

## Options

- `-a, --all` — List resources across all projects
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-m, --meta <KEY=VALUE>` (repeatable) — Filter deployments by metadata (e.g.: `-m KEY=value`). Can appear many times.
- `-N, --next <MS>` — Show next page of results
- `-p, --policy <KEY=VALUE>` (repeatable) — See deployments with provided Deployment Retention policies (e.g.: `-p KEY=value`). Can appear many times.
- `-s, --status <STATUS>` — Filter deployments by their status. Can be comma-separated for multiple statuses (e.g.: `--status BUILDING,READY`)
- `-y, --yes` — Accept default value for all prompts

## Examples

List all deployments for the currently linked project

```
$ vercel list
```

List all deployments across all projects

```
$ vercel list --all
```

List all deployments for the project `my-app`

```
$ vercel list my-app
```

Filter deployments by metadata

```
$ vercel list -m key1=value1 -m key2=value2
```

Paginate deployments for a project, where `1584722256178` is the time in milliseconds since the UNIX epoch

```
$ vercel list my-app --next 1584722256178
```

Filter deployments by status

```
$ vercel list --status READY
```

Filter deployments by multiple statuses

```
$ vercel list --status BUILDING,ERROR
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

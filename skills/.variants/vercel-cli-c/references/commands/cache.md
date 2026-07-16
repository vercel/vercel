<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel cache

Manage cache for a Project

```
vercel cache <command>
```

## Subcommands

### `vercel cache dangerously-delete`

Dangerously delete all cached content by tag

```
vercel cache dangerously-delete [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--revalidation-deadline-seconds <REVALIDATION-DEADLINE-SECONDS>` — Revalidation deadline in seconds
- `--srcimg <SRCIMG>` — Source Image to delete
- `--tag <TAGS>` — Tags to delete (comma-separated)
- `-y, --yes` — Accept default value for all prompts

#### Examples

Dangerously delete all cached content associated with a tag

```
$ vercel cache dangerously-delete --tag foo
```

Dangerously delete all cached content associated with a tag if not accessed in the next hour

```
$ vercel cache dangerously-delete --tag foo --revalidation-deadline-seconds 3600
```

Dangerously delete all cached content associated with a source image

```
$ vercel cache dangerously-delete --srcimg /api/avatar/1
```

Dangerously delete all cached content associated with a source image if not accessed in the next hour

```
$ vercel cache dangerously-delete --srcimg /api/avatar/1 --revalidation-deadline-seconds 3600
```

### `vercel cache invalidate`

Invalidate all cached content by tag

```
vercel cache invalidate [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--srcimg <SRCIMG>` — Source Image to invalidate
- `--tag <TAGS>` — Tags to invalidate (comma-separated)
- `-y, --yes` — Accept default value for all prompts

#### Examples

Invalidate all cached content associated with a tag

```
$ vercel cache invalidate --tag foo
```

Invalidate all cached content associated with any one of multiple tags

```
$ vercel cache invalidate --tag foo,bar,baz
```

Invalidate all cached content associated with a source image

```
$ vercel cache invalidate --srcimg /api/avatar/1
```

### `vercel cache purge`

Purge cache for the current project

```
vercel cache purge [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--type <TYPE>` — Type of cache to purge
- `-y, --yes` — Accept default value for all prompts

#### Examples

Purge all caches for the current project

```
$ vercel cache purge
```

Purge only the CDN cache

```
$ vercel cache purge --type cdn
```

Purge only the data cache

```
$ vercel cache purge --type data
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

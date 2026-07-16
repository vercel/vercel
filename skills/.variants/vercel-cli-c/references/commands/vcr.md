<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel vcr

Manage Vercel Container Registry repositories and images (see `vcr image`).

```
vercel vcr <command>
```

## Subcommands

### `vercel vcr add`

Create a container registry repository

Aliases: `create`

```
vercel vcr add <name> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).

#### Examples

Create a repository

```
$ vercel vcr add my-repository
```

### `vercel vcr image`

List, inspect, or delete images in a repository

Aliases: `images`

```
vercel vcr image <command>
```

##### `vercel vcr image inspect`

Show details for a single image, including its layer history

Aliases: `get`

```
vercel vcr image inspect <repository> <imageId> [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).

###### Examples

Inspect an image by id

```
$ vercel vcr image inspect my-app img_abc123
```

##### `vercel vcr image ls`

List images in a container registry repository

Aliases: `list`

```
vercel vcr image ls <repository> [options]
```

###### Options

- `-c, --cursor <STRING>` — Cursor from a previous page to continue listing from
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).
- `--untagged` — Only list images that have no tags

###### Examples

List images in a repository

```
$ vercel vcr image ls my-app
```

List untagged images as JSON

```
$ vercel vcr image ls my-app --untagged --format json
```

##### `vercel vcr image rm`

Delete an image from a repository

Aliases: `remove`, `delete`

```
vercel vcr image rm <repository> <imageId> [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).
- `-y, --yes` — Accept default value for all prompts

###### Examples

Delete an image by id

```
$ vercel vcr image rm my-app img_abc123
```

Delete an image without the confirmation prompt

```
$ vercel vcr image rm my-app img_abc123 --yes
```

### `vercel vcr inspect`

Show details for a single repository

Aliases: `get`

```
vercel vcr inspect <repository> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).

#### Examples

Inspect a repository by name

```
$ vercel vcr inspect my-repository
```

### `vercel vcr login`

Authenticate a container tool (docker, podman, or buildah) with the Vercel Container Registry

```
vercel vcr login <engine> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).

#### Examples

Log in with Docker

```
$ vercel vcr login docker
```

Log in with Podman

```
$ vercel vcr login podman
```

Log in with Buildah

```
$ vercel vcr login buildah
```

Log in for a specific project

```
$ vercel vcr login docker --project my-app
```

### `vercel vcr ls`

List container registry repositories for a project

Aliases: `list`

```
vercel vcr ls [options]
```

#### Options

- `-c, --cursor <STRING>` — Cursor from a previous page to continue listing from
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).

#### Examples

List repositories in the linked project

```
$ vercel vcr ls
```

List repositories for a specific project as JSON

```
$ vercel vcr ls --project my-app --format json
```

### `vercel vcr rm`

Delete a container registry repository

Aliases: `remove`, `delete`

```
vercel vcr rm <repository> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).
- `-y, --yes` — Accept default value for all prompts

#### Examples

Delete a repository

```
$ vercel vcr rm my-repository
```

Delete a repository without the confirmation prompt

```
$ vercel vcr rm my-repository --yes
```

### `vercel vcr tag`

List or inspect a repository's tags

Aliases: `tags`

```
vercel vcr tag <command>
```

##### `vercel vcr tag inspect`

Show details for a single tag

Aliases: `get`

```
vercel vcr tag inspect <repository> <tag> [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).

###### Examples

Inspect a tag by name

```
$ vercel vcr tag inspect my-app latest
```

##### `vercel vcr tag ls`

List a repository's tags

Aliases: `list`

```
vercel vcr tag ls <repository> [options]
```

###### Options

- `-c, --cursor <STRING>` — Cursor from a previous page to continue listing from
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project).
- `--sort-by <FIELD>` — Field to sort tags by (default: updatedAt)
- `--sort-order <ORDER>` — Sort direction (default: desc)

###### Examples

List a repository's tags

```
$ vercel vcr tag ls my-app
```

## Examples

List repositories in the linked project

```
$ vercel vcr ls
```

Create a repository

```
$ vercel vcr add my-app
```

List images in a repository

```
$ vercel vcr image ls my-app
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

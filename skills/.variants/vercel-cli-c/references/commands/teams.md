<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel teams

Manage Teams under your Vercel account

Aliases: `switch`, `team`

```
vercel teams <command>
```

## Subcommands

### `vercel teams add`

Create a new team

Aliases: `create`

```
vercel teams add [options]
```

#### Options

- `--name` — Display name for the team; required in non-interactive mode
- `--slug` — Team URL slug (e.g. acme for vercel.com/acme); required in non-interactive mode

#### Examples

Create a team (interactive)

```
$ vercel teams add
```

Create a team non-interactively

```
$ vercel teams add --slug acme --name "Acme Corp"
```

### `vercel teams invite`

Invite a new member to a team

```
vercel teams invite <email ...>
```

#### Examples

Invite new members (interactively)

```
$ vercel teams invite
```

Invite multiple members (required in non-interactive mode)

```
$ vercel teams invite abc@vercel.com xyz@vercel.com
```

### `vercel teams list`

Show all teams that you're a member of

Aliases: `ls`

```
vercel teams list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results

#### Examples

Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch

```
$ vercel teams ls --next 1584722256178
```

### `vercel teams members`

List members for the currently scoped team

Aliases: `member`

```
vercel teams members [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results

#### Examples

List team members

```
$ vercel teams members
```

List team members as JSON

```
$ vercel teams members --format json
```

Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch

```
$ vercel teams members --next 1584722256178
```

### `vercel teams request`

Show join-request status for the current team (defaults to the authenticated user)

Aliases: `access-request`

```
vercel teams request [userId] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Status for your pending request

```
$ vercel teams request
```

Status for another user id

```
$ vercel teams request user_abc123
```

### `vercel teams sso`

Show SAML / SSO configuration for the current team

```
vercel teams sso [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Human-readable SAML summary

```
$ vercel teams sso
```

JSON

```
$ vercel teams sso --format json
```

### `vercel teams switch`

Switch to a different team

Aliases: `change`

```
vercel teams switch [name]
```

#### Examples

Switch to a team. If your team's url is 'vercel.com/name', then 'name' is the slug. If the slug is omitted, you can choose interactively

```
$ vercel teams switch <slug>
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.

<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel domains

Manage domains

Aliases: `domain`

```
vercel domains [command]
```

## Subcommands

### `vercel domains add`

Add a domain name that you already own to a Vercel Team

```
vercel domains add <domain> [project] [options]
```

#### Options

- `--force` — Force a domain name for a project and remove it from an existing one

#### Examples

Add a domain that you already own

```
$ vercel domains add domain-name.com
$ Make sure the domain's DNS nameservers are at least 2 of the ones listed on https://vercel.com/edge-network
$ NOTE: Running vercel alias will automatically register your domain if it's configured with these nameservers (no need to 'domains add')
```

### `vercel domains buy`

Purchase a new domain name

```
vercel domains buy <domain>
```

### `vercel domains check`

Check if a domain is available to buy

```
vercel domains check <domain ...> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Check if a domain is available

```
$ vercel domains check example.com
```

Check availability for multiple domains

```
$ vercel domains check one.com two.com three.com
```

JSON output

```
$ vercel domains check example.com --format json
```

### `vercel domains inspect`

Displays information related to a domain

```
vercel domains inspect <domain>
```

### `vercel domains list`

Show all domains in a list (default subcommand)

Aliases: `ls`

```
vercel domains list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results

#### Examples

Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch

```
$ vercel domains ls --next 1584722256178
```

### `vercel domains move`

Move ownership of a domain name to another Vercel Team

```
vercel domains move <domain> <destination> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when moving a domain

### `vercel domains price`

Show registrar price quotes for one or more domains

```
vercel domains price <domain ...> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Price quote for a domain

```
$ vercel domains price example.com
```

Price quotes for multiple domains

```
$ vercel domains price one.com two.com three.com
```

JSON output

```
$ vercel domains price example.com --format json
```

### `vercel domains remove`

Remove ownership of a domain name from a Vercel Team

Aliases: `rm`

```
vercel domains remove <domain> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when removing a domain

### `vercel domains search`

Discover domain-name candidates from a keyword or fragment

```
vercel domains search <query> [options]
```

#### Options

- `--available` — Show only candidates available to register
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of candidates to check per page (default: 20, max: 200)
- `--next <CURSOR>` — Show the next page of candidates
- `--order <ORDER>` — Order candidates by relevance, alphabetical order, or length (default: relevance)
- `--tld <TLD>` (repeatable) — Filter candidates by exact TLD. Repeatable.

#### Examples

Discover domain-name candidates

```
$ vercel domains search acme
```

Narrow candidates with a TLD fragment

```
$ vercel domains search acme.d
```

Filter candidates by TLD

```
$ vercel domains search acme --tld com --tld dev
```

Show only available candidates

```
$ vercel domains search acme --available
```

JSON output

```
$ vercel domains search acme --format=json
```

### `vercel domains transfer-in`

Transfer in a domain name to Vercel

```
vercel domains transfer-in <domain>
```

### `vercel domains verify`

Check a domain's DNS configuration and explain what to fix when it is misconfigured or unverified

```
vercel domains verify <domain> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--strict` — Check DNS for the exact domain only, without falling back to the parent zone configuration

#### Examples

Check why a domain is not working

```
$ vercel domains verify example.com
```

Check a domain against a specific project

```
$ vercel domains verify example.com --project my-site
```

JSON output (the exit code is non-zero when the domain is misconfigured or unverified)

```
$ vercel domains verify example.com --format json
```

Agent-friendly output with status, reason, and suggested next commands

```
$ vercel domains verify example.com --non-interactive
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
